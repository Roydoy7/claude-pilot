using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Runtime;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// Main plugin application class that handles initialization and cleanup
    /// </summary>
    public class PluginApplication : IExtensionApplication
    {
        /// <summary>
        /// Called when the plugin is loaded into AutoCAD
        /// </summary>
        public void Initialize()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc != null)
            {
                doc.Editor.WriteMessage("\n========================================");
                doc.Editor.WriteMessage("\nClaudePilot AutoCAD Plugin");
                doc.Editor.WriteMessage("\nVersion: 0.1.0");
                doc.Editor.WriteMessage("\n========================================");

                // Auto-start connection
                string serverUrl = PluginCommands.GetServerUrl();
                PluginCommands.StartConnectionWithUrl(serverUrl);

                doc.Editor.WriteMessage($"\nAuto-connected to server: {serverUrl}");
                doc.Editor.WriteMessage("\nUse CPCONFIG to change server settings");
                doc.Editor.WriteMessage("\nType 'CPHELP' for available commands");
                doc.Editor.WriteMessage("\n========================================\n");
            }
        }

        /// <summary>
        /// Called when the plugin is unloaded from AutoCAD
        /// </summary>
        public void Terminate()
        {
            // Stop connection when plugin unloads
            PluginCommands.StopConnectionInternal();

            Document doc = Application.DocumentManager.MdiActiveDocument;
            if (doc != null)
            {
                doc.Editor.WriteMessage("\nClaudePilot AutoCAD Plugin Unloaded\n");
            }
        }
    }
}
