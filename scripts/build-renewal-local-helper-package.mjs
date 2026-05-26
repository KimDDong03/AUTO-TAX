import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(repoRoot, "dist", "renewal-local-helper");
const appDir = path.join(outputRoot, "app");
const appNodeModulesDir = path.join(appDir, "node_modules");
const runtimeDir = path.join(outputRoot, "runtime");
const scriptsDir = path.join(outputRoot, "scripts");
const trayExePath = path.join(appDir, "ATHelperTray.exe");
const helperReleaseSourcePath = path.join(repoRoot, "scripts", "renewal-local-helper-release.json");
const outputMetadataPath = path.join(repoRoot, "dist", "renewal-local-helper.json");
const outputZipPath = path.join(repoRoot, "dist", "renewal-local-helper.zip");
const outputExePath = path.join(repoRoot, "dist", "renewal-local-helper.exe");
const staticDownloadDir = path.join(repoRoot, "web", "public", "downloads");
const staticDownloadMetadataPath = path.join(staticDownloadDir, "renewal-local-helper.json");
const staticDownloadZipPath = path.join(staticDownloadDir, "AT helper.zip");
const staticDownloadExePath = path.join(staticDownloadDir, "AT helper.exe");
const legacyStaticDownloadZipPath = path.join(staticDownloadDir, "renewal-local-helper.zip");
const legacyStaticDownloadExePath = path.join(staticDownloadDir, "renewal-local-helper.exe");
const runtimeVersionPath = path.join(appDir, "renewal-local-helper-release.json");
const installerStagingDir = path.join(repoRoot, "dist", "renewal-local-helper-installer");
const trayStagingDir = path.join(repoRoot, "dist", "renewal-local-helper-tray");
const installerIconSourcePath = path.join(repoRoot, "scripts", "assets", "helper-installer-icon.png");
const ZIP_BASENAME = "AT helper";
const EXE_BASENAME = "AT helper";

function resolveVersionedZipFileName(version) {
  const safeVersion = typeof version === "string" && version.trim() ? version.trim() : "0.0.0";
  return `${ZIP_BASENAME}-${safeVersion}.zip`;
}

function resolveVersionedExeFileName(version) {
  const safeVersion = typeof version === "string" && version.trim() ? version.trim() : "0.0.0";
  return `${EXE_BASENAME}-${safeVersion}.exe`;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readHelperReleaseConfig() {
  const config = readJsonFile(helperReleaseSourcePath);
  const latestVersion = typeof config.version === "string" ? config.version.trim() : "";
  const minSupportedVersion =
    typeof config.minSupportedVersion === "string" ? config.minSupportedVersion.trim() : latestVersion;
  const releasedAt = typeof config.releasedAt === "string" ? config.releasedAt.trim() : "";

  if (!latestVersion) {
    throw new Error(`Local helper release metadata is missing version: ${helperReleaseSourcePath}`);
  }

  if (!minSupportedVersion) {
    throw new Error(`Local helper release metadata is missing minSupportedVersion: ${helperReleaseSourcePath}`);
  }

  if (!releasedAt) {
    throw new Error(`Local helper release metadata is missing releasedAt: ${helperReleaseSourcePath}`);
  }

  return {
    latestVersion,
    minSupportedVersion,
    releasedAt
  };
}

function buildHelperReleaseMetadata() {
  const config = readHelperReleaseConfig();
  return {
    latestVersion: config.latestVersion,
    minSupportedVersion: config.minSupportedVersion,
    downloadUrl: `/downloads/${encodeURIComponent(resolveVersionedExeFileName(config.latestVersion))}`,
    zipDownloadUrl: `/downloads/${encodeURIComponent(resolveVersionedZipFileName(config.latestVersion))}`,
    releasedAt: config.releasedAt
  };
}

function resetDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EBUSY") {
      throw new Error(`${dirPath} is busy. Stop the local helper first, then package it again.`);
    }
    throw error;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyRecursive(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function writeWindowsCmdScript(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\r\n")}\r\n`, "ascii");
}

function writePackageReadme() {
  const content = [
    "AT helper",
    "",
    "1. Copy this folder to the customer PC.",
    "2. Run scripts\\renewal-helper-install.cmd.",
    "3. The installer starts the latest AT helper automatically after install.",
    "4. Use AUTO-TAX Helper Start / Stop / Status shortcuts as needed.",
    "5. Disable Autostart only removes logon autostart. Start / Stop / Status shortcuts stay available.",
    "",
    "Manual commands:",
    "  scripts\\renewal-helper-start.cmd",
    "  scripts\\renewal-helper-stop.cmd",
    "  scripts\\renewal-helper-status.cmd",
    "  scripts\\renewal-helper-uninstall.cmd"
  ].join("\r\n");

  fs.writeFileSync(path.join(outputRoot, "README.txt"), content, "utf8");
}

function writeZipArchive(archivePath = outputZipPath) {
  if (fs.existsSync(archivePath)) {
    fs.rmSync(archivePath, { force: true });
  }

  const sourcePattern = path.join(outputRoot, "*").replace(/\\/g, "\\\\");
  const destinationPath = archivePath.replace(/\\/g, "\\\\");
  const command = `Compress-Archive -Path "${sourcePattern}" -DestinationPath "${destinationPath}" -Force`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      `Failed to create renewal helper zip: ${result.stderr?.trim() || result.stdout?.trim() || "PowerShell failed"}`
    );
  }
}

function writePngBackedIconFile(iconPath) {
  if (!fs.existsSync(installerIconSourcePath)) {
    throw new Error(`Could not find helper installer icon: ${installerIconSourcePath}`);
  }

  const pngBytes = fs.readFileSync(installerIconSourcePath);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBytes.length, 14);
  header.writeUInt32LE(header.length, 18);
  fs.writeFileSync(iconPath, Buffer.concat([header, pngBytes]));
}

function writeInstallerSourceFile(sourcePath) {
  const source = String.raw`
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace AutoTaxRenewalHelperInstaller
{
  public static class Program
  {
    [STAThread]
    public static int Main()
    {
      Application.EnableVisualStyles();
      Application.SetCompatibleTextRenderingDefault(false);

      using (InstallerForm form = new InstallerForm())
      {
        Application.Run(form);
        return form.ExitCode;
      }
    }
  }

  public sealed class InstallerForm : Form
  {
    private readonly TextBox installPathTextBox;
    private readonly Button installButton;
    private readonly Button closeButton;
    private readonly TextBox logTextBox;
    private readonly string defaultInstallRoot;

    public int ExitCode { get; private set; }

    public InstallerForm()
    {
      defaultInstallRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AUTO-TAX",
        "renewal-local-helper");

      Text = "AT helper 설치";
      StartPosition = FormStartPosition.CenterScreen;
      FormBorderStyle = FormBorderStyle.FixedDialog;
      MaximizeBox = false;
      MinimizeBox = true;
      ClientSize = new Size(620, 430);

      Label titleLabel = new Label();
      titleLabel.Text = "AT helper 설치";
      titleLabel.Font = new Font(Font.FontFamily, 16, FontStyle.Bold);
      titleLabel.SetBounds(24, 22, 560, 30);

      Label descriptionLabel = new Label();
      descriptionLabel.Text = "공동인증서 연결에 필요한 helper를 설치하고 Windows 로그인 시 자동으로 시작되도록 설정합니다.";
      descriptionLabel.SetBounds(24, 62, 560, 36);

      Label pathLabel = new Label();
      pathLabel.Text = "설치 위치";
      pathLabel.SetBounds(24, 116, 560, 20);

      installPathTextBox = new TextBox();
      installPathTextBox.Text = defaultInstallRoot;
      installPathTextBox.SetBounds(24, 140, 460, 24);

      Button browseButton = new Button();
      browseButton.Text = "찾아보기...";
      browseButton.SetBounds(494, 138, 100, 28);
      browseButton.Click += BrowseButton_Click;

      logTextBox = new TextBox();
      logTextBox.Multiline = true;
      logTextBox.ReadOnly = true;
      logTextBox.ScrollBars = ScrollBars.Vertical;
      logTextBox.SetBounds(24, 186, 570, 172);

      installButton = new Button();
      installButton.Text = "설치";
      installButton.SetBounds(388, 376, 100, 32);
      installButton.Click += InstallButton_Click;

      closeButton = new Button();
      closeButton.Text = "닫기";
      closeButton.SetBounds(494, 376, 100, 32);
      closeButton.Click += delegate { Close(); };

      Controls.Add(titleLabel);
      Controls.Add(descriptionLabel);
      Controls.Add(pathLabel);
      Controls.Add(installPathTextBox);
      Controls.Add(browseButton);
      Controls.Add(logTextBox);
      Controls.Add(installButton);
      Controls.Add(closeButton);

      AcceptButton = installButton;
      CancelButton = closeButton;
      ExitCode = 1;
    }

    private void BrowseButton_Click(object sender, EventArgs eventArgs)
    {
      using (FolderBrowserDialog dialog = new FolderBrowserDialog())
      {
        dialog.Description = "AT helper를 설치할 위치를 선택하세요.";
        dialog.SelectedPath = installPathTextBox.Text.Trim().Length > 0 ? installPathTextBox.Text.Trim() : defaultInstallRoot;
        dialog.ShowNewFolderButton = true;

        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
          installPathTextBox.Text = dialog.SelectedPath;
        }
      }
    }

    private void InstallButton_Click(object sender, EventArgs eventArgs)
    {
      string installRoot = installPathTextBox.Text.Trim();
      if (installRoot.Length == 0)
      {
        MessageBox.Show(this, "설치 위치를 선택하세요.", "AT helper 설치", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return;
      }

      installButton.Enabled = false;
      closeButton.Enabled = false;
      logTextBox.Clear();
      AppendLog("설치를 시작합니다.");
      AppendLog("설치 위치: " + installRoot);

      try
      {
        RunInstall(installRoot);
        AppendLog("");
        AppendLog("설치가 완료되었습니다.");
        AppendLog("AT helper가 자동시작으로 등록되었고 지금 실행 중입니다.");
        ExitCode = 0;
        MessageBox.Show(this, "AT helper 설치가 완료되었습니다.", "AT helper 설치", MessageBoxButtons.OK, MessageBoxIcon.Information);
      }
      catch (Exception error)
      {
        AppendLog("");
        AppendLog("설치에 실패했습니다.");
        AppendLog(error.Message);
        ExitCode = 1;
        MessageBox.Show(this, error.Message, "AT helper 설치 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
      }
      finally
      {
        installButton.Enabled = ExitCode != 0;
        closeButton.Enabled = true;
      }
    }

    private void RunInstall(string installRoot)
    {
      string payloadDir = Path.Combine(Path.GetTempPath(), "auto-tax-renewal-local-helper-" + Guid.NewGuid().ToString("N"));
      string zipPath = Path.Combine(payloadDir, "renewal-local-helper.zip");

      try
      {
        Directory.CreateDirectory(payloadDir);
        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("renewal-local-helper.zip"))
        {
          if (resource == null)
          {
            throw new InvalidOperationException("Installer payload is missing.");
          }

          using (FileStream output = File.Create(zipPath))
          {
            resource.CopyTo(output);
          }
        }

        RunPowerShell("-NoProfile -ExecutionPolicy Bypass -Command \"Expand-Archive -LiteralPath '" + zipPath.Replace("'", "''") + "' -DestinationPath '" + payloadDir.Replace("'", "''") + "' -Force\"");
        string installScript = Path.Combine(payloadDir, "scripts", "install-renewal-local-helper-autostart.ps1");
        RunPowerShell(
          "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " +
          QuoteCommandLineArgument(installScript) +
          " -StartNow -SkipTrayOnStart -InstallRoot " +
          QuoteCommandLineArgument(installRoot));
        StartTray(installRoot);
      }
      finally
      {
        try
        {
          if (Directory.Exists(payloadDir))
          {
            Directory.Delete(payloadDir, true);
          }
        }
        catch
        {
          // Temporary installer files are safe to leave behind if Windows still has a handle open.
        }
      }
    }

    private void RunPowerShell(string arguments)
    {
      ProcessStartInfo startInfo = new ProcessStartInfo("powershell.exe", arguments);
      startInfo.UseShellExecute = false;
      startInfo.RedirectStandardOutput = true;
      startInfo.RedirectStandardError = true;
      startInfo.CreateNoWindow = true;
      Process process = Process.Start(startInfo);
      string output = process.StandardOutput.ReadToEnd();
      string error = process.StandardError.ReadToEnd();
      process.WaitForExit();

      AppendPowerShellOutput(output);
      AppendPowerShellOutput(error);

      if (process.ExitCode != 0)
      {
        throw new InvalidOperationException("PowerShell command failed with exit code " + process.ExitCode + ".");
      }
    }

    private void StartTray(string installRoot)
    {
      string trayExe = Path.Combine(installRoot, "app", "ATHelperTray.exe");
      if (!File.Exists(trayExe))
      {
        return;
      }

      ProcessStartInfo startInfo = new ProcessStartInfo(trayExe, "--port 35119");
      startInfo.WorkingDirectory = installRoot;
      startInfo.UseShellExecute = true;
      startInfo.WindowStyle = ProcessWindowStyle.Hidden;
      Process.Start(startInfo);
    }

    private static string QuoteCommandLineArgument(string value)
    {
      return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private void AppendPowerShellOutput(string value)
    {
      if (String.IsNullOrWhiteSpace(value))
      {
        return;
      }

      string[] lines = value.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
      foreach (string line in lines)
      {
        if (line.Trim().Length > 0)
        {
          AppendLog(line);
        }
      }
    }

    private void AppendLog(string message)
    {
      logTextBox.AppendText(message + Environment.NewLine);
      logTextBox.SelectionStart = logTextBox.TextLength;
      logTextBox.ScrollToCaret();
      Application.DoEvents();
    }
  }
}
`;
  fs.writeFileSync(sourcePath, source.trimStart(), "utf8");
}

function writeInstallerCompileScript(scriptPath, sourcePath, iconPath, zipPath, exePath) {
  const script = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName Microsoft.CSharp
$provider = New-Object Microsoft.CSharp.CSharpCodeProvider
$parameters = New-Object System.CodeDom.Compiler.CompilerParameters
$parameters.GenerateExecutable = $true
$parameters.OutputAssembly = ${JSON.stringify(exePath)}
$parameters.MainClass = "AutoTaxRenewalHelperInstaller.Program"
$parameters.CompilerOptions = "/target:winexe /win32icon:${iconPath.replace(/\\/g, "\\\\")} /resource:${zipPath.replace(/\\/g, "\\\\")},renewal-local-helper.zip"
[void]$parameters.ReferencedAssemblies.Add("System.dll")
[void]$parameters.ReferencedAssemblies.Add("System.Drawing.dll")
[void]$parameters.ReferencedAssemblies.Add("System.Windows.Forms.dll")
$result = $provider.CompileAssemblyFromFile($parameters, ${JSON.stringify(sourcePath)})
if ($result.Errors.HasErrors) {
  $messages = @()
  foreach ($errorItem in $result.Errors) {
    $messages += $errorItem.ToString()
  }
  throw ($messages -join [Environment]::NewLine)
}
`;
  fs.writeFileSync(scriptPath, script.trimStart(), "utf8");
}

function writeInstallerExe(versionedZipPath, exePath) {
  resetDir(installerStagingDir);
  copyRecursive(versionedZipPath, path.join(installerStagingDir, "renewal-local-helper.zip"));
  const stagedZipPath = path.join(installerStagingDir, "renewal-local-helper.zip");
  const iconPath = path.join(installerStagingDir, "helper-installer.ico");
  const sourcePath = path.join(installerStagingDir, "AutoTaxRenewalHelperInstaller.cs");
  const compileScriptPath = path.join(installerStagingDir, "compile-installer.ps1");
  writePngBackedIconFile(iconPath);
  writeInstallerSourceFile(sourcePath);
  writeInstallerCompileScript(compileScriptPath, sourcePath, iconPath, stagedZipPath, exePath);

  if (fs.existsSync(exePath)) {
    fs.rmSync(exePath, { force: true });
  }

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", compileScriptPath], {
    cwd: installerStagingDir,
    encoding: "utf8"
  });

  if (result.status !== 0 || !fs.existsSync(exePath)) {
    throw new Error(
      `Failed to create renewal helper installer exe: ${result.stderr?.trim() || result.stdout?.trim() || "PowerShell compile failed"}`
    );
  }
}

function writeTraySourceFile(sourcePath) {
  const source = String.raw`
using System;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace AutoTaxRenewalHelperTray
{
  public static class Program
  {
    [STAThread]
    public static int Main(string[] args)
    {
      int port = ResolvePort(args);
      bool createdNew;
      using (Mutex mutex = new Mutex(true, "AUTO_TAX_RENEWAL_HELPER_TRAY_" + port, out createdNew))
      {
        if (!createdNew)
        {
          return 0;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (TrayApplicationContext context = new TrayApplicationContext(port))
        {
          Application.Run(context);
        }
      }

      return 0;
    }

    private static int ResolvePort(string[] args)
    {
      for (int index = 0; index < args.Length - 1; index += 1)
      {
        int parsed;
        if (String.Equals(args[index], "--port", StringComparison.OrdinalIgnoreCase) &&
            Int32.TryParse(args[index + 1], out parsed) &&
            parsed > 0)
        {
          return parsed;
        }
      }

      string envValue = Environment.GetEnvironmentVariable("AUTO_TAX_RENEWAL_HELPER_PORT");
      int envPort;
      if (Int32.TryParse(envValue, out envPort) && envPort > 0)
      {
        return envPort;
      }

      return 35119;
    }
  }

  public sealed class TrayApplicationContext : ApplicationContext
  {
    private readonly int port;
    private readonly NotifyIcon notifyIcon;
    private readonly ToolStripMenuItem statusMenuItem;
    private readonly ToolStripMenuItem versionMenuItem;
    private readonly System.Windows.Forms.Timer refreshTimer;
    private string currentStatus = "확인 중";
    private string currentVersion = "-";

    public TrayApplicationContext(int port)
    {
      this.port = port;

      statusMenuItem = new ToolStripMenuItem("상태: 확인 중");
      statusMenuItem.Enabled = false;

      versionMenuItem = new ToolStripMenuItem("버전: -");
      versionMenuItem.Enabled = false;

      ToolStripMenuItem exitMenuItem = new ToolStripMenuItem("종료");
      exitMenuItem.Click += ExitMenuItem_Click;

      ContextMenuStrip menu = new ContextMenuStrip();
      menu.Opening += delegate { RefreshStatus(); };
      menu.Items.Add(statusMenuItem);
      menu.Items.Add(versionMenuItem);
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add(exitMenuItem);

      notifyIcon = new NotifyIcon();
      notifyIcon.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
      notifyIcon.Text = "AT helper - 확인 중";
      notifyIcon.ContextMenuStrip = menu;
      notifyIcon.Visible = true;
      notifyIcon.DoubleClick += delegate { ShowCurrentStatus(); };

      refreshTimer = new System.Windows.Forms.Timer();
      refreshTimer.Interval = 5000;
      refreshTimer.Tick += delegate { RefreshStatus(); };
      refreshTimer.Start();

      RefreshStatus();
    }

    private void RefreshStatus()
    {
      try
      {
        string body = SendRequest("GET", "/health");
        string version = ExtractJsonString(body, "version");
        currentStatus = "실행 중";
        currentVersion = String.IsNullOrWhiteSpace(version) ? "-" : version;
      }
      catch
      {
        currentStatus = "연결 안 됨";
        currentVersion = "-";
      }

      statusMenuItem.Text = "상태: " + currentStatus;
      versionMenuItem.Text = "버전: " + currentVersion;
      notifyIcon.Text = TruncateNotifyText("AT helper - " + currentStatus + (currentVersion == "-" ? "" : " (" + currentVersion + ")"));
    }

    private void ExitMenuItem_Click(object sender, EventArgs eventArgs)
    {
      try
      {
        SendRequest("POST", "/api/shutdown");
      }
      catch
      {
        // If the helper is already gone, closing the tray icon is still the requested action.
      }

      notifyIcon.Visible = false;
      Application.Exit();
    }

    private void ShowCurrentStatus()
    {
      RefreshStatus();
      MessageBox.Show(
        "상태: " + currentStatus + Environment.NewLine + "버전: " + currentVersion,
        "AT helper",
        MessageBoxButtons.OK,
        MessageBoxIcon.Information);
    }

    private string SendRequest(string method, string path)
    {
      HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + path);
      request.Method = method;
      request.Timeout = 3000;

      if (method == "POST")
      {
        byte[] body = Encoding.UTF8.GetBytes("{}");
        request.ContentType = "application/json";
        request.ContentLength = body.Length;
        using (Stream stream = request.GetRequestStream())
        {
          stream.Write(body, 0, body.Length);
        }
      }

      using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
      using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
      {
        return reader.ReadToEnd();
      }
    }

    private static string ExtractJsonString(string json, string key)
    {
      Match match = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"([^\"]*)\"");
      return match.Success ? match.Groups[1].Value : "";
    }

    private static string TruncateNotifyText(string value)
    {
      return value.Length <= 63 ? value : value.Substring(0, 63);
    }

    protected override void Dispose(bool disposing)
    {
      if (disposing)
      {
        refreshTimer.Dispose();
        notifyIcon.Dispose();
      }

      base.Dispose(disposing);
    }
  }
}
`;
  fs.writeFileSync(sourcePath, source.trimStart(), "utf8");
}

function writeTrayCompileScript(scriptPath, sourcePath, iconPath, exePath) {
  const script = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName Microsoft.CSharp
$provider = New-Object Microsoft.CSharp.CSharpCodeProvider
$parameters = New-Object System.CodeDom.Compiler.CompilerParameters
$parameters.GenerateExecutable = $true
$parameters.OutputAssembly = ${JSON.stringify(exePath)}
$parameters.MainClass = "AutoTaxRenewalHelperTray.Program"
$parameters.CompilerOptions = "/target:winexe /win32icon:${iconPath.replace(/\\/g, "\\\\")}"
[void]$parameters.ReferencedAssemblies.Add("System.dll")
[void]$parameters.ReferencedAssemblies.Add("System.Drawing.dll")
[void]$parameters.ReferencedAssemblies.Add("System.Windows.Forms.dll")
$result = $provider.CompileAssemblyFromFile($parameters, ${JSON.stringify(sourcePath)})
if ($result.Errors.HasErrors) {
  $messages = @()
  foreach ($errorItem in $result.Errors) {
    $messages += $errorItem.ToString()
  }
  throw ($messages -join [Environment]::NewLine)
}
`;
  fs.writeFileSync(scriptPath, script.trimStart(), "utf8");
}

function writeTrayExe() {
  resetDir(trayStagingDir);
  const iconPath = path.join(trayStagingDir, "helper-tray.ico");
  const sourcePath = path.join(trayStagingDir, "ATHelperTray.cs");
  const compileScriptPath = path.join(trayStagingDir, "compile-tray.ps1");
  writePngBackedIconFile(iconPath);
  writeTraySourceFile(sourcePath);
  writeTrayCompileScript(compileScriptPath, sourcePath, iconPath, trayExePath);

  if (fs.existsSync(trayExePath)) {
    fs.rmSync(trayExePath, { force: true });
  }

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", compileScriptPath], {
    cwd: trayStagingDir,
    encoding: "utf8"
  });

  if (result.status !== 0 || !fs.existsSync(trayExePath)) {
    throw new Error(
      `Failed to create renewal helper tray exe: ${result.stderr?.trim() || result.stdout?.trim() || "PowerShell compile failed"}`
    );
  }
}

function syncStaticDownloadAsset(versionedZipPath, versionedStaticZipPath, versionedExePath, versionedStaticExePath) {
  fs.mkdirSync(staticDownloadDir, { recursive: true });
  copyRecursive(versionedZipPath, versionedStaticZipPath);
  copyRecursive(versionedZipPath, staticDownloadZipPath);
  copyRecursive(versionedZipPath, legacyStaticDownloadZipPath);
  copyRecursive(versionedExePath, versionedStaticExePath);
  copyRecursive(versionedExePath, staticDownloadExePath);
  copyRecursive(versionedExePath, legacyStaticDownloadExePath);
  copyRecursive(outputMetadataPath, staticDownloadMetadataPath);
}

async function buildBundle() {
  await esbuild.build({
    entryPoints: [path.join(repoRoot, "scripts", "renewal-local-helper.ts")],
    outfile: path.join(appDir, "renewal-local-helper.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: false,
    minify: true,
    legalComments: "none",
    define: {
      "process.env.AUTO_TAX_RENEWAL_AGENT_DISABLE_AUTO_START": "\"1\""
    },
    external: ["playwright"]
  });
}

function copyRuntime() {
  const nodeExe = process.execPath;
  if (!fs.existsSync(nodeExe)) {
    throw new Error(`Could not find node.exe: ${nodeExe}`);
  }

  copyRecursive(nodeExe, path.join(runtimeDir, "node.exe"));
}

function copyPlaywrightRuntime() {
  const playwrightDir = path.join(repoRoot, "node_modules", "playwright");
  const playwrightCoreDir = path.join(repoRoot, "node_modules", "playwright-core");

  if (!fs.existsSync(playwrightDir) || !fs.existsSync(playwrightCoreDir)) {
    throw new Error("Could not find playwright or playwright-core. Run npm install and try again.");
  }

  copyRecursive(playwrightDir, path.join(appNodeModulesDir, "playwright"));
  copyRecursive(playwrightCoreDir, path.join(appNodeModulesDir, "playwright-core"));
}

function copyScripts() {
  const powershellScriptNames = [
    "start-renewal-local-helper.ps1",
    "stop-renewal-local-helper.ps1",
    "status-renewal-local-helper.ps1",
    "install-renewal-local-helper-autostart.ps1",
    "uninstall-renewal-local-helper-autostart.ps1"
  ];

  for (const scriptName of powershellScriptNames) {
    copyRecursive(path.join(repoRoot, "scripts", scriptName), path.join(scriptsDir, scriptName));
  }

  const cmdScripts = {
    "renewal-helper-install.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0install-renewal-local-helper-autostart.ps1\" -StartNow",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo AUTO-TAX renewal helper install completed.",
      "pause",
      "exit /b 0",
      "",
      ":fail",
      "set \"_exit=%errorlevel%\"",
      "echo.",
      "echo AUTO-TAX renewal helper install failed.",
      "pause",
      "exit /b %_exit%"
    ],
    "renewal-helper-start.cmd": [
      "@echo off",
      "setlocal",
      "echo Starting AUTO-TAX helper...",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%~dp0start-renewal-local-helper.ps1\" -Detached",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo AUTO-TAX helper start command completed.",
      "echo.",
      "echo Current helper status:",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0status-renewal-local-helper.ps1\"",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo Check status=running above to confirm the helper is ON.",
      "pause",
      "exit /b 0",
      "",
      ":fail",
      "set \"_exit=%errorlevel%\"",
      "echo.",
      "echo AUTO-TAX renewal helper start failed.",
      "pause",
      "exit /b %_exit%"
    ],
    "renewal-helper-stop.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0stop-renewal-local-helper.ps1\"",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo AUTO-TAX renewal helper stopped.",
      "pause",
      "exit /b 0",
      "",
      ":fail",
      "set \"_exit=%errorlevel%\"",
      "echo.",
      "echo AUTO-TAX renewal helper stop failed.",
      "pause",
      "exit /b %_exit%"
    ],
    "renewal-helper-status.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File \"%~dp0status-renewal-local-helper.ps1\""
    ],
    "renewal-helper-uninstall.cmd": [
      "@echo off",
      "setlocal",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0uninstall-renewal-local-helper-autostart.ps1\"",
      "if errorlevel 1 goto :fail",
      "echo.",
      "echo AUTO-TAX renewal helper autostart removed. Start/Stop/Status shortcuts stay available.",
      "pause",
      "exit /b 0",
      "",
      ":fail",
      "set \"_exit=%errorlevel%\"",
      "echo.",
      "echo AUTO-TAX renewal helper autostart removal failed.",
      "pause",
      "exit /b %_exit%"
    ]
  };

  for (const [scriptName, lines] of Object.entries(cmdScripts)) {
    writeWindowsCmdScript(path.join(scriptsDir, scriptName), lines);
  }
}

function writeReleaseMetadataAssets() {
  const metadata = buildHelperReleaseMetadata();
  writeJsonFile(outputMetadataPath, metadata);
  writeJsonFile(runtimeVersionPath, {
    version: metadata.latestVersion,
    releasedAt: metadata.releasedAt
  });
}

async function main() {
  const metadata = buildHelperReleaseMetadata();
  const versionedZipPath = path.join(repoRoot, "dist", resolveVersionedZipFileName(metadata.latestVersion));
  const versionedStaticZipPath = path.join(staticDownloadDir, resolveVersionedZipFileName(metadata.latestVersion));
  const versionedExePath = path.join(repoRoot, "dist", resolveVersionedExeFileName(metadata.latestVersion));
  const versionedStaticExePath = path.join(staticDownloadDir, resolveVersionedExeFileName(metadata.latestVersion));

  resetDir(outputRoot);
  fs.mkdirSync(appNodeModulesDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });

  await buildBundle();
  copyRuntime();
  copyPlaywrightRuntime();
  copyScripts();
  writeReleaseMetadataAssets();
  writeTrayExe();
  writePackageReadme();
  writeZipArchive(versionedZipPath);
  if (fs.existsSync(outputZipPath)) {
    fs.rmSync(outputZipPath, { force: true });
  }
  fs.copyFileSync(versionedZipPath, outputZipPath);
  writeInstallerExe(versionedZipPath, versionedExePath);
  if (fs.existsSync(outputExePath)) {
    fs.rmSync(outputExePath, { force: true });
  }
  fs.copyFileSync(versionedExePath, outputExePath);
  syncStaticDownloadAsset(versionedZipPath, versionedStaticZipPath, versionedExePath, versionedStaticExePath);

  console.log(`output=${outputRoot}`);
  console.log(`metadata=${outputMetadataPath}`);
  console.log(`zip=${versionedZipPath}`);
  console.log(`legacyZip=${outputZipPath}`);
  console.log(`exe=${versionedExePath}`);
  console.log(`legacyExe=${outputExePath}`);
  console.log(`publicMetadata=${staticDownloadMetadataPath}`);
  console.log(`publicZip=${versionedStaticZipPath}`);
  console.log(`publicLegacyZip=${staticDownloadZipPath}`);
  console.log(`publicExe=${versionedStaticExePath}`);
  console.log(`publicLegacyExe=${staticDownloadExePath}`);
}

await main();
