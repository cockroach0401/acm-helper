from __future__ import annotations

import asyncio
import os

from ..models.problem import SolutionStatus
from ..models.task import TaskStatus
from ..storage.file_manager import FileManager
from .solution_gen import SolutionGenerator
from .tag_gen import TagGenerator


class TaskRunner:
    def __init__(self, fm: FileManager, solution_generator: SolutionGenerator, tag_generator: TagGenerator):
        self.fm = fm
        self.solution_generator = solution_generator
        self.tag_generator = tag_generator
        self.max_concurrency = int(os.getenv("TASK_MAX_CONCURRENCY", "2"))
        self._semaphore = asyncio.Semaphore(self.max_concurrency)

    async def enqueue_solution_task(self, problem_key: str) -> str:
        settings = self.fm.get_settings()
        active_profile = settings.ai.resolve_active_profile()
        task = self.fm.create_task(problem_key, provider_name=active_profile.name)
        self.fm.set_problem_solution_state(problem_key, SolutionStatus.queued)
        asyncio.create_task(self._run_solution_task(task.task_id))
        return task.task_id

    async def enqueue_ai_tag_task(self, problem_key: str) -> str:
        settings = self.fm.get_settings()
        active_profile = settings.ai.resolve_active_profile()
        task = self.fm.create_ai_tag_task(problem_key, provider_name=active_profile.name)
        asyncio.create_task(self._run_ai_tag_task(task.task_id))
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

    async def _run_ai_tag_task(self, task_id: str) -> None:
        async with self._semaphore:
            task = self.fm.get_task(task_id)
            if task is None:
                return

            self.fm.update_task(task_id, status=TaskStatus.running, started=True)

            problem = self.fm.get_problem_by_key(task.problem_key)
            if problem is None:
                err = f"problem not found for key={task.problem_key}"
                self.fm.update_task(task_id, status=TaskStatus.failed, error_message=err, finished=True)
                return

            try:
                solution_markdown = self.fm.read_solution_file(problem.source, problem.id) or ""
                settings = self.fm.get_settings()
                tags, difficulty = await self.tag_generator.generate(
                    problem,
                    settings.ai,
                    solution_markdown=solution_markdown,
                )

                updated = self.fm.update_problem_info(
                    problem.source,
                    problem.id,
                    tags=tags,
                    difficulty=difficulty,
                    difficulty_set=True,
                )
                if updated is None:
                    raise RuntimeError(f"failed to update problem info for key={task.problem_key}")

                summary_parts = [" / ".join(tags)] if tags else []
                if difficulty is not None:
                    summary_parts.append(str(difficulty))
                summary = " | ".join(summary_parts) if summary_parts else "done"

                self.fm.update_task(
                    task_id,
                    status=TaskStatus.succeeded,
                    output_path=summary,
                    error_message="",
                    finished=True,
                )
            except Exception as exc:
                self.fm.update_task(
                    task_id,
                    status=TaskStatus.failed,
                    error_message=str(exc),
                    finished=True,
                )
