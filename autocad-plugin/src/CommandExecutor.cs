using System;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Newtonsoft.Json.Linq;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// Index info for the current document
    /// </summary>
    public class IndexInfo
    {
        public string Path { get; set; }
        public string EntitiesFile { get; set; }
        public string Hint { get; set; }
    }

    /// <summary>
    /// Command execution result with optional data
    /// </summary>
    public class CommandExecutionResult
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public object Data { get; set; }
        public IndexInfo IndexInfo { get; set; }

        public CommandExecutionResult(bool success, string message = "", object data = null)
        {
            Success = success;
            Message = message;
            Data = data;
        }
    }

    /// <summary>
    /// Executes commands received from server in AutoCAD
    /// </summary>
    public partial class CommandExecutor
    {
        private readonly Document _document;
        private readonly Editor _editor;
        private readonly DocumentCollection _documentManager;

        public CommandExecutor(Document document)
        {
            _documentManager = Autodesk.AutoCAD.ApplicationServices.Core.Application.DocumentManager;
            _document = document;
            _editor = document.Editor;
        }

        /// <summary>
        /// Execute a command from server
        /// 10 core operations:
        /// - Data: extract, get_document_list, get_drawing_overview, set_active_document
        /// - View: zoom_extents, zoom_window, zoom_center, pan_to_point
        /// - Index: get_index_path
        /// - Script: execute_script
        /// </summary>
        public CommandExecutionResult ExecuteCommand(Command command)
        {
            try
            {
                // Auto-sync index in background for all commands (except index commands themselves)
                string cmdType = command.Type.ToLower();
                if (cmdType != "get_index_path")
                {
                    TryAutoSyncIndex();
                }

                CommandExecutionResult result;

                switch (cmdType)
                {
                    // Data extraction and document management commands
                    case "extract":
                    case "get_document_list":
                    case "get_drawing_overview":
                    case "set_active_document":
                        result = ExecuteDataExtractionCommand(command);
                        break;

                    // View control commands
                    case "get_view":
                    case "zoom_extents":
                    case "zoom_window":
                    case "zoom_center":
                    case "pan_to_point":
                        result = ExecuteViewCommand(command);
                        break;

                    // Index path query
                    case "get_index_path":
                        result = ExecuteIndexCommand(command);
                        break;

                    // Script execution - handles all other operations via extension methods
                    case "execute_script":
                        result = ExecuteScript(command.Data);
                        break;

                    default:
                        return new CommandExecutionResult(false, $"Unknown command type: {command.Type}. Use execute_script for custom operations.");
                }
                // Append index info to successful results (except for index commands themselves)
                if (result.Success && cmdType != "get_index_path")
                {
                    result = AppendIndexInfo(result);
                }

                return result;
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, ex.Message);
            }
        }

        /// <summary>
        /// Append index info to command result
        /// </summary>
        private CommandExecutionResult AppendIndexInfo(CommandExecutionResult result)
        {
            var indexInfo = GetIndexInfo();
            if (indexInfo != null)
            {
                result.IndexInfo = indexInfo;
            }
            return result;
        }

        /// <summary>
        /// Try to auto-sync index silently (non-blocking, errors are ignored)
        /// </summary>
        private void TryAutoSyncIndex()
        {
            try
            {
                // Only sync if document has a valid file path (saved file)
                if (string.IsNullOrEmpty(_document.Name) || !System.IO.File.Exists(_document.Name))
                    return;

                // Call SyncIndex with default parameters (will skip if already up to date)
                SyncIndex(null);
            }
            catch
            {
                // Silently ignore any errors - auto-sync should not affect main command
            }
        }

        /// <summary>
        /// Get brief index info for the current document (to be appended to command results)
        /// Returns null if document is not saved or index doesn't exist
        /// </summary>
        private IndexInfo GetIndexInfo()
        {
            try
            {
                if (string.IsNullOrEmpty(_document.Name) || !System.IO.File.Exists(_document.Name))
                    return null;

                string indexPath = GetIndexDirectoryPath(_document.Name);
                string entitiesPath = System.IO.Path.Combine(indexPath, "entities.jsonl");

                if (!System.IO.Directory.Exists(indexPath) || !System.IO.File.Exists(entitiesPath))
                    return null;

                return new IndexInfo
                {
                    Path = indexPath,
                    EntitiesFile = entitiesPath,
                    Hint = "Use grep on entities.jsonl to search: handle(h), type(t), layer(l), text(txt), blockName(bn), attributes(attr)"
                };
            }
            catch
            {
                return null;
            }
        }
    }
}
