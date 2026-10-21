/**
 * Minimal, marked modifications that Disco applies to a pristine copy of the
 * pinned BCU sources before building the helper. Each replacement must match
 * exactly once; the build fails instead of silently skipping a patch. Every
 * modified file receives a "Modified by Disco" notice, as Apache-2.0 requires.
 */
const NOTICE = 'Modified by Disco (https://github.com/nikporras/Disco)';

export const BCU_PATCHES = [
  {
    file: 'source/Directory.Build.props',
    reason: 'target .NET 10 instead of .NET 8',
    replacements: [
      [
        '<TargetFramework>net8.0-windows10.0.18362.0</TargetFramework>',
        `<!-- ${NOTICE}: target .NET 10. -->\n\t\t<TargetFramework>net10.0-windows10.0.18362.0</TargetFramework>`,
      ],
    ],
  },
  {
    file: 'source/app.manifest',
    reason: 'helpers run unelevated; elevation goes only through the Disco broker',
    replacements: [
      [
        '<requestedExecutionLevel level="requireAdministrator" uiAccess="false" />\r\n      </requestedPrivileges>',
        `<!-- ${NOTICE}: run as invoker; Disco elevates only through its broker. -->\r\n        <requestedExecutionLevel level="asInvoker" uiAccess="false" />\r\n      </requestedPrivileges>`,
      ],
    ],
  },
  {
    file: 'source/KlocTools/IO/WmiQueries.cs',
    reason: 'Windows Features query returned no items on .NET 10',
    header: true,
    replacements: [
      [
        'new EnumerationOptions(null, TimeSpan.FromSeconds(35), 100, false, false, false, false, false, false, false));',
        // On .NET 10, ToList() reads Count first, which consumes a non-rewindable enumeration.
        'new EnumerationOptions(null, TimeSpan.FromSeconds(35), 100, true, false, false, false, false, false, false));',
      ],
    ],
  },
  {
    file: 'source/KlocTools/Forms/Tools/PremadeDialogs.cs',
    reason: 'route errors to a handler instead of modal dialogs in headless hosts',
    header: true,
    replacements: [
      [
        'public static Action<Exception> SendErrorAction { get; set; }',
        'public static Action<Exception> SendErrorAction { get; set; }\r\n\r\n' +
          `        /// <summary>${NOTICE}: when set, errors are reported here and no dialog is shown.</summary>\r\n` +
          '        public static Action<string, string> HeadlessErrorHandler { get; set; }',
      ],
      [
        'Console.WriteLine(@"Showing error message: " + ex);',
        'Console.WriteLine(@"Showing error message: " + ex);\r\n\r\n' +
          '            if (HeadlessErrorHandler != null)\r\n' +
          '            {\r\n' +
          '                HeadlessErrorHandler(ex.Message, GetExceptionDetailString(ex));\r\n' +
          '                return;\r\n' +
          '            }',
      ],
      [
        'var entryAsy = Assembly.GetEntryAssembly();',
        'if (HeadlessErrorHandler != null)\r\n' +
          '            {\r\n' +
          '                HeadlessErrorHandler(errorType, additionalInfo);\r\n' +
          '                return;\r\n' +
          '            }\r\n\r\n' +
          '            var entryAsy = Assembly.GetEntryAssembly();',
      ],
    ],
  },
];

export const MODIFIED_NOTICE = NOTICE;
