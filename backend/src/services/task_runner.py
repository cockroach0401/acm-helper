from __future__ import annotations

import asyncio
import os

from ..models.problem import SolutionStatus
from ..models.task import TaskStatus
from ..storage.file_manager import FileManager
from .solution_gen import SolutionGenerator


class TaskRunner:
    def __init__(self, fm: FileManager, solution_generator: SolutionGenerator):
        self.fm = fm
        self.solution_generator = solution_generator
        self.max_concurrency = int(os.getenv("TASK_MAX_CONCURRENCY", "2"))
        self._semaphore = asyncio.Semaphore(self.max_concurrency)

    async def enqueue_solution_task(self, problem_key: str) -> str:
        settings = self.fm.get_settings()
        active_profile = settings.ai.resolve_active_profile()
        task = self.fm.create_task(problem_key, provider_name=active_profile.name)
        self.fm.set_problem_solution_state(problem_key, SolutionStatus.queued)
        asyncio.create_task(self._run_solution_task(task.task_id))
        return task.task_id

    async def _run_solution_task(self, task_id: str) -> None:
        async with self._semaphore:
            task = self.fm.get_task(task_id)
            if task is None:
                return

            self.fm.update_task(task_id, status=TaskStatus.running, started=True)
            self.fm.set_problem_solution_state(task.problem_key, SolutionStatus.running)

            problem = self.fm.get_problem_by_key(task.problem_key)
            if problem is None:
                err = f"problem not found for key={task.problem_key}"
                self.fm.update_task(task_id, status=TaskStatus.failed, error_message=err, finished=True)
                self.fm.set_problem_solution_state(task.problem_key, SolutionStatus.failed)
                return

            try:
                # Load solution images if any
                images_base64: list[str] = []
                for img_meta in problem.solution_images:
                    if img_meta.relative_path:
                        b64 = self.fm.read_solution_image_base64(img_meta.relative_path)
                        if b64:
                            images_base64.append(b64)

                settings = self.fm.get_settings()
                content = await self.solution_generator.generate(
                    problem,
                    prompt_template=settings.prompts.solution_template,
                    ai_settings=settings.ai,
                    default_ac_language=settings.ui.default_ac_language.value,
                    prompt_settings=settings.prompts,
                    images_base64=images_base64,
                )
                output_path = self.fm.save_solution_file(problem, content)
                self.fm.update_task(
                    task_id,
                    status=TaskStatus.succeeded,
                    output_path=output_path,
                    error_message="",
                    finished=True,
                )
                self.fm.set_problem_solution_state(task.problem_key, SolutionStatus.done, mark_needs_solution=False)
            except Exception as exc:
                self.fm.update_task(
                    task_id,
                    status=TaskStatus.failed,
                    error_message=str(exc),
                    finished=True,
                )
                self.fm.set_problem_solution_state(task.problem_key, SolutionStatus.failed, mark_needs_solution=True)
