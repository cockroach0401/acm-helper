# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build specification for ACM Helper Backend."""

block_cipher = None

a = Analysis(
    ['run_server.py'],
    pathex=[],
    binaries=[],
    datas=[('data', 'data')],  # Include data directory
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'tkinter',
        'tkinter.filedialog',
        'pystray._win32',
        'PIL._tkinter_finder',
        'src',
        'src.main',
        'src.routes',
        'src.routes.dashboard',
        'src.routes.problems',
        'src.routes.reports',
        'src.routes.settings',
        'src.routes.solutions',
        'src.routes.stats',
        'src.models',
        'src.services',
        'src.services.autostart',
        'src.storage',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ACMHelper',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # Hide console window (runs in tray)
    icon='icon.ico',  # Application icon
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

