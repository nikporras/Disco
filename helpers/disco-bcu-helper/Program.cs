// Disco's read-only Bulk Crap Uninstaller helper.
//
// Protocol (schema version 1): every line on stdout is one JSON object with
// "schemaVersion" and "type". Disco's Rust Core owns every decision; this helper
// only reports what BCU finds and never modifies the system.
//
//   disco-bcu-helper inventory   -> zero or more "progress"/"warning" lines, then one "inventory" line
//   disco-bcu-helper version     -> one "version" line
//
// Exit codes: 0 success, 1 scan failure, 2 invalid usage.
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Klocman.Forms.Tools;
using UninstallTools;
using UninstallTools.Factory;

namespace Disco.BcuHelper;

internal static class Program
{
    internal const int SchemaVersion = 1;
    private const int ExitSuccess = 0;
    private const int ExitScanFailed = 1;
    private const int ExitUsage = 2;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    [STAThread]
    private static int Main(string[] args)
    {
        // BCU writes diagnostics with Console.WriteLine. Keep stdout for the
        // protocol only by sending everything else to stderr.
        var protocol = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        Console.SetOut(Console.Error);
        var output = new ProtocolWriter(protocol, JsonOptions);

        if (args.Length != 1)
            return Usage(output);

        return args[0] switch
        {
            "inventory" => RunInventory(output),
            "version" => RunVersion(output),
            _ => Usage(output),
        };
    }

    private static int Usage(ProtocolWriter output)
    {
        output.Write(new ErrorMessage("usage", "Usage: disco-bcu-helper inventory|version"));
        return ExitUsage;
    }

    private static int RunVersion(ProtocolWriter output)
    {
        var version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0.0";
        output.Write(new VersionMessage(version, Environment.Version.ToString()));
        return ExitSuccess;
    }

    private static int RunInventory(ProtocolWriter output)
    {
        ConfigureHeadless(output);
        try
        {
            string? lastMessage = null;
            var entries = ApplicationUninstallerFactory.GetUninstallerEntries(report =>
            {
                if (report.Message == lastMessage)
                    return;
                lastMessage = report.Message;
                output.Write(new ProgressMessage(report.CurrentCount, report.TotalCount, report.Message));
            });
            var applications = entries.Select(InventoryApplication.From).ToList();
            output.Write(new InventoryMessage(applications));
            return ExitSuccess;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            output.Write(new ErrorMessage("scan_failed", error.Message));
            return ExitScanFailed;
        }
    }

    private static void ConfigureHeadless(ProtocolWriter output)
    {
        // Mirrors BCU-console's unattended configuration, without the uninstall daemon.
        UninstallToolsGlobalConfig.ScanWinUpdates = false;
        UninstallToolsGlobalConfig.AutoDetectCustomProgramFiles = true;
        // The info cache would be written next to the helper executable.
        UninstallToolsGlobalConfig.EnableAppInfoCache = false;
        // BCU shows modal error dialogs by default; a headless helper must never block on UI.
        PremadeDialogs.HeadlessErrorHandler = (message, details) =>
        {
            Console.Error.WriteLine(details);
            output.Write(new WarningMessage("bcu_error", message));
        };
    }
}

/// <summary>Serializes protocol messages one per line; BCU may report from worker threads.</summary>
internal sealed class ProtocolWriter(TextWriter writer, JsonSerializerOptions options)
{
    private readonly object _gate = new();

    public void Write<T>(T message) where T : ProtocolMessage
    {
        var line = JsonSerializer.Serialize(message, options);
        lock (_gate)
            writer.WriteLine(line);
    }
}

internal abstract record ProtocolMessage(string Type)
{
    [JsonPropertyOrder(-2)]
    public int SchemaVersion => Program.SchemaVersion;

    [JsonPropertyOrder(-1)]
    public string Type { get; } = Type;
}

internal sealed record ProgressMessage(int Current, int Total, string? Message) : ProtocolMessage("progress");

internal sealed record WarningMessage(string Code, string Message) : ProtocolMessage("warning");

internal sealed record ErrorMessage(string Code, string Message) : ProtocolMessage("error");

internal sealed record VersionMessage(string Helper, string Runtime) : ProtocolMessage("version");

internal sealed record InventoryMessage(IReadOnlyList<InventoryApplication> Applications) : ProtocolMessage("inventory");

/// <summary>Facts reported by BCU for one application. Disco treats them as evidence, never as authorization.</summary>
internal sealed record InventoryApplication(
    string DisplayName,
    string? Publisher,
    string? Version,
    string Kind,
    string? InstallLocation,
    string? UninstallerLocation,
    string? UninstallString,
    string? QuietUninstallString,
    string? RegistryPath,
    string? RegistryKeyName,
    string? InstallDate,
    long? EstimatedSizeKb,
    string Architecture,
    bool IsRegistered,
    bool IsOrphaned,
    bool IsProtected,
    bool IsUpdate,
    bool IsSystemComponent,
    bool IsValid)
{
    public static InventoryApplication From(ApplicationUninstallerEntry entry)
    {
        var sizeKb = entry.EstimatedSize.GetKbSize();
        return new InventoryApplication(
            entry.DisplayName,
            Blank(entry.Publisher),
            Blank(entry.DisplayVersion),
            entry.UninstallerKind.ToString(),
            Blank(entry.InstallLocation),
            Blank(entry.UninstallerLocation),
            Blank(entry.UninstallString),
            Blank(entry.QuietUninstallString),
            Blank(entry.RegistryPath),
            Blank(entry.RegistryKeyName),
            entry.InstallDate == default ? null : entry.InstallDate.ToString("yyyy-MM-dd"),
            sizeKb > 0 ? sizeKb : null,
            entry.Is64Bit.ToString(),
            entry.IsRegistered,
            entry.IsOrphaned,
            entry.IsProtected,
            entry.IsUpdate,
            entry.SystemComponent,
            entry.IsValid);
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
