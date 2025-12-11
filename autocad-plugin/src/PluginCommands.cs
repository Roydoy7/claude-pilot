using System;
using System.IO;
using System.Threading.Tasks;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using Newtonsoft.Json;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// Configuration settings for ClaudePilot plugin
    /// </summary>
    public class PluginConfig
    {
        public int ServerPort { get; set; } = 58273;
    }

    public class PluginCommands
    {
        private static CommandPoller _poller;

        // Default port: 58273 (uncommon port to avoid conflicts)
        private const int DEFAULT_PORT = 58273;
        private const string CONFIG_FILE_NAME = "config.json";

        /// <summary>
        /// Get config file path in user's AppData folder
        /// </summary>
        private static string GetConfigFilePath()
        {
            string appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string configDir = Path.Combine(appDataPath, "ClaudePilot", "AutoCAD");

            // Create directory if it doesn't exist
            if (!Directory.Exists(configDir))
            {
                Directory.CreateDirectory(configDir);
            }

            return Path.Combine(configDir, CONFIG_FILE_NAME);
        }

        /// <summary>
        /// Load configuration from JSON file
        /// </summary>
        private static PluginConfig LoadConfig()
        {
            try
            {
                string configPath = GetConfigFilePath();
                if (File.Exists(configPath))
                {
                    string json = File.ReadAllText(configPath);
                    return JsonConvert.DeserializeObject<PluginConfig>(json) ?? new PluginConfig();
                }
            }
            catch
            {
                // Fall through to default
            }

            return new PluginConfig();
        }

        /// <summary>
        /// Save configuration to JSON file
        /// </summary>
        private static void SaveConfig(PluginConfig config)
        {
            try
            {
                string configPath = GetConfigFilePath();
                string json = JsonConvert.SerializeObject(config, Formatting.Indented);
                File.WriteAllText(configPath, json);
            }
            catch (System.Exception ex)
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc != null)
                {
                    doc.Editor.WriteMessage($"\nError saving config: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Get server URL from config or use default
        /// </summary>
        internal static string GetServerUrl()
        {
            int port = GetServerPort();
            return $"http://localhost:{port}";
        }

        /// <summary>
        /// Get server port from config or use default
        /// </summary>
        private static int GetServerPort()
        {
            PluginConfig config = LoadConfig();
            return config.ServerPort > 0 ? config.ServerPort : DEFAULT_PORT;
        }

        /// <summary>
        /// Save server port to config
        /// </summary>
        private static void SaveServerPort(int port)
        {
            PluginConfig config = LoadConfig();
            config.ServerPort = port;
            SaveConfig(config);
        }

        /// <summary>
        /// Start connection with specified URL (internal helper)
        /// </summary>
        internal static void StartConnectionWithUrl(string serverUrl)
        {
            if (_poller != null && _poller.IsRunning)
            {
                return;
            }

            _poller = new CommandPoller(serverUrl);
            _poller.Start();
        }

        /// <summary>
        /// Stop connection (internal helper)
        /// </summary>
        internal static void StopConnectionInternal()
        {
            if (_poller != null && _poller.IsRunning)
            {
                _poller.Stop();
                _poller = null;
            }
        }

        /// <summary>
        /// Test command to verify plugin is loaded successfully
        /// Usage: Type "CPTEST" in AutoCAD command line
        /// </summary>
        [CommandMethod("CPTEST")]
        public void TestCommand()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Editor ed = doc.Editor;

            ed.WriteMessage("\n========================================");
            ed.WriteMessage("\nClaudePilot AutoCAD Plugin");
            ed.WriteMessage("\nVersion: 0.1.0");
            ed.WriteMessage("\nStatus: Plugin loaded successfully!");
            ed.WriteMessage("\n========================================\n");
        }

        /// <summary>
        /// Display available commands
        /// Usage: Type "CPHELP" in AutoCAD command line
        /// </summary>
        [CommandMethod("CPHELP")]
        public void HelpCommand()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Editor ed = doc.Editor;

            ed.WriteMessage("\n========================================");
            ed.WriteMessage("\nClaudePilot AutoCAD Plugin - Commands");
            ed.WriteMessage("\n========================================");
            ed.WriteMessage("\nCPTEST   - Test plugin installation");
            ed.WriteMessage("\nCPHELP   - Show this help message");
            ed.WriteMessage("\nCPSTART  - Start server connection");
            ed.WriteMessage("\nCPSTOP   - Stop server connection");
            ed.WriteMessage("\nCPSTATUS - Show connection status");
            ed.WriteMessage("\nCPCONFIG - Configure server port");
            ed.WriteMessage("\n========================================\n");
        }

        /// <summary>
        /// Start connection to ClaudePilot server
        /// Usage: Type "CPSTART" in AutoCAD command line
        /// </summary>
        [CommandMethod("CPSTART")]
        public void StartConnection()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Editor ed = doc.Editor;

            if (_poller != null && _poller.IsRunning)
            {
                ed.WriteMessage("\nConnection already active");
                return;
            }

            string serverUrl = GetServerUrl();
            StartConnectionWithUrl(serverUrl);

            ed.WriteMessage($"\nConnected to server: {serverUrl}");
        }

        /// <summary>
        /// Stop connection to ClaudePilot server
        /// Usage: Type "CPSTOP" in AutoCAD command line
        /// </summary>
        [CommandMethod("CPSTOP")]
        public void StopConnection()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Editor ed = doc.Editor;

            if (_poller == null || !_poller.IsRunning)
            {
                ed.WriteMessage("\nNo active connection");
                return;
            }

            _poller.Stop();
            _poller = null;

            ed.WriteMessage("\nDisconnected from server");
        }

        /// <summary>
        /// Show connection status
        /// Usage: Type "CPSTATUS" in AutoCAD command line
        /// </summary>
        [CommandMethod("CPSTATUS")]
        public void ShowStatus()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Editor ed = doc.Editor;

            ed.WriteMessage("\n========================================");
            ed.WriteMessage("\nConnection Status");
            ed.WriteMessage("\n========================================");

            string serverUrl = GetServerUrl();
            ed.WriteMessage($"\nServer URL: {serverUrl}");

            if (_poller != null && _poller.IsRunning)
            {
                ed.WriteMessage("\nStatus: CONNECTED");
                ed.WriteMessage("\nPolling: Active");
            }
            else
            {
                ed.WriteMessage("\nStatus: DISCONNECTED");
                ed.WriteMessage("\nUse CPSTART to connect");
            }

            ed.WriteMessage("\n========================================\n");
        }

        /// <summary>
        /// Configure server port
        /// Usage: Type "CPCONFIG" in AutoCAD command line
        /// </summary>
        [CommandMethod("CPCONFIG")]
        public void ConfigureServer()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Editor ed = doc.Editor;

            int currentPort = GetServerPort();

            ed.WriteMessage("\n========================================");
            ed.WriteMessage("\nClaudePilot Configuration");
            ed.WriteMessage("\n========================================");
            ed.WriteMessage($"\nCurrent port: {currentPort}");
            ed.WriteMessage($"\nConfig file: {GetConfigFilePath()}");

            PromptIntegerOptions pio = new PromptIntegerOptions($"\nEnter new port number (1024-65535) [current: {currentPort}]: ")
            {
                DefaultValue = currentPort,
                LowerLimit = 1024,
                UpperLimit = 65535,
                AllowNone = true
            };

            PromptIntegerResult pir = ed.GetInteger(pio);
            if (pir.Status != PromptStatus.OK)
            {
                ed.WriteMessage("\nConfiguration cancelled.");
                return;
            }

            int newPort = pir.Value;
            if (newPort == currentPort)
            {
                ed.WriteMessage("\nPort unchanged.");
                return;
            }

            SaveServerPort(newPort);
            ed.WriteMessage($"\nPort changed to: {newPort}");

            // Restart connection if active
            if (_poller != null && _poller.IsRunning)
            {
                ed.WriteMessage("\nRestarting connection with new port...");
                _poller.Stop();
                _poller = null;

                string newServerUrl = GetServerUrl();
                StartConnectionWithUrl(newServerUrl);
                ed.WriteMessage($"\nReconnected to: {newServerUrl}");
            }
            else
            {
                ed.WriteMessage("\nUse CPSTART to connect with the new port.");
            }

            ed.WriteMessage("\n========================================\n");
        }
    }
}
