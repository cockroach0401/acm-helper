#define MyAppName "ACM Helper"
#define MyAppExeName "ACMHelper.exe"
#define MyAppVersion GetEnv("APP_VERSION")

#if MyAppVersion == ""
  #define MyAppVersion "2.1.0"
#endif

[Setup]
AppId={{A2E6A7E4-6F43-4B74-9E40-F1A3A4C37B11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=ACM Helper
DefaultDirName={autopf}\ACM Helper
DefaultGroupName=ACM Helper
UninstallDisplayIcon={app}\icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
OutputDir=..\dist
OutputBaseFilename=ACMHelper-Setup-{#MyAppVersion}
SetupIconFile=..\icon.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "autostart"; Description: "开机静默自启动"; GroupDescription: "附加任务:"; Flags: unchecked
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务:"; Flags: unchecked

[Files]
Source: "..\dist\ACMHelper.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\ACM Helper"; Filename: "{app}\ACMHelper.exe"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\ACM Helper"; Filename: "{app}\ACMHelper.exe"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ACM Helper"; ValueData: """{app}\ACMHelper.exe"" --silent"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\ACMHelper.exe"; Description: "启动 ACM Helper"; Flags: nowait postinstall skipifsilent

