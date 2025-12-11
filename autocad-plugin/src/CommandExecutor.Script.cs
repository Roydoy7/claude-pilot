using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;
using System.Linq;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.ApplicationServices.Core;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// Global context available to scripts
    /// Scripts can access Document, Database, Editor directly
    /// </summary>
    public class ScriptGlobals
    {
        /// <summary>Current AutoCAD document</summary>
        public Document Document { get; set; }

        // <summary>AutoCAD document manager</summary>
        public DocumentCollection DocumentManager { get; set; }

        /// <summary>Current drawing database</summary>
        public Database Database { get; set; }

        /// <summary>Editor for user interaction and selection</summary>
        public Editor Editor { get; set; }

        public Autodesk.AutoCAD.ApplicationServices.Core.Application Application { get; set; }

        /// <summary>
        /// Helper: Start a new transaction
        /// </summary>
        public Transaction StartTransaction()
        {
            return Database.TransactionManager.StartTransaction();
        }

        /// <summary>
        /// Helper: Get ModelSpace BlockTableRecord for write
        /// </summary>
        public BlockTableRecord GetModelSpaceForWrite(Transaction tr)
        {
            var bt = (BlockTable)tr.GetObject(Database.BlockTableId, OpenMode.ForRead);
            return (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForWrite);
        }

        /// <summary>
        /// Helper: Get ModelSpace BlockTableRecord for read
        /// </summary>
        public BlockTableRecord GetModelSpaceForRead(Transaction tr)
        {
            var bt = (BlockTable)tr.GetObject(Database.BlockTableId, OpenMode.ForRead);
            return (BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace], OpenMode.ForRead);
        }

        /// <summary>
        /// Helper: Create a Point3d from x, y coordinates (z=0)
        /// </summary>
        public Point3d Point(double x, double y)
        {
            return new Point3d(x, y, 0);
        }

        /// <summary>
        /// Helper: Create a Point3d from x, y, z coordinates
        /// </summary>
        public Point3d Point(double x, double y, double z)
        {
            return new Point3d(x, y, z);
        }
    }

    /// <summary>
    /// Script execution for AutoCAD using Roslyn
    /// </summary>
    public partial class CommandExecutor
    {
        private static ScriptOptions _scriptOptions;

        /// <summary>
        /// Get or create script options with all necessary references and imports
        /// </summary>
        private static ScriptOptions GetScriptOptions()
        {
            if (_scriptOptions == null)
            {
                _scriptOptions = ScriptOptions.Default
                    // Add references to assemblies
                    .AddReferences(
                        // AutoCAD assemblies
                        typeof(DocumentCollection).Assembly,           // AcMgd (ApplicationServices)
                        typeof(Document).Assembly,           // AcMgd (ApplicationServices)
                        typeof(Database).Assembly,           // AcDbMgd (DatabaseServices)
                        typeof(Editor).Assembly,             // AcMgd (EditorInput)
                        typeof(Point3d).Assembly,            // AcDbMgd (Geometry)
                        typeof(Autodesk.AutoCAD.Colors.Color).Assembly, // AcDbMgd (Colors)
                        typeof(Autodesk.AutoCAD.Runtime.CommandMethodAttribute).Assembly, // AcCoreMgd (Runtime)
                        // ClaudePilot extensions
                        typeof(Extensions.BlockExtensions).Assembly, // ClaudePilot.AutoCAD.Extensions
                        // .NET Framework assemblies
                        typeof(object).Assembly,             // mscorlib
                        typeof(List<>).Assembly,             // System.Collections.Generic
                        typeof(Enumerable).Assembly,         // System.Linq
                        typeof(System.Text.StringBuilder).Assembly, // System
                        typeof(System.IO.Path).Assembly,     // System.IO
                        typeof(System.Math).Assembly,        // System (Math)
                        typeof(System.Reflection.Assembly).Assembly,        // System.Reflection
                        typeof(System.Text.RegularExpressions.Regex).Assembly, // System.Text.RegularExpressions
                        // Newtonsoft.Json for JSON handling
                        typeof(JsonConvert).Assembly,        // Newtonsoft.Json
                        typeof(JObject).Assembly             // Newtonsoft.Json.Linq
                    )
                    // Add common imports so scripts don't need using statements
                    .AddImports(
                        // System namespaces
                        "System",
                        "System.Reflection",
                        "System.Collections.Generic",
                        "System.Linq",
                        "System.Text",
                        "System.IO",
                        "System.Text.RegularExpressions",
                        // AutoCAD namespaces
                        "Autodesk.AutoCAD.ApplicationServices",
                        "Autodesk.AutoCAD.ApplicationServices.Core", // Application class in .NET 5.0+ (AutoCAD 2022+)
                        "Autodesk.AutoCAD.DatabaseServices",
                        "Autodesk.AutoCAD.EditorInput",
                        "Autodesk.AutoCAD.Geometry",
                        "Autodesk.AutoCAD.Colors",
                        "Autodesk.AutoCAD.Runtime",
                        // ClaudePilot extensions (GetBlockName, GetBlockAttributes, etc.)
                        "ClaudePilot.AutoCAD.Extensions",
                        // JSON support
                        "Newtonsoft.Json",
                        "Newtonsoft.Json.Linq"
                    );
            }
            return _scriptOptions;
        }

        /// <summary>
        /// Execute a C# script in the context of the current document
        /// </summary>
        public CommandExecutionResult ExecuteScript(object data)
        {
            try
            {
                var json = data as JObject ?? JObject.FromObject(data);
                var code = json["code"]?.ToString();

                if (string.IsNullOrWhiteSpace(code))
                {
                    return new CommandExecutionResult(false, "No code provided");
                }

                // Create globals with current document context
                var globals = new ScriptGlobals
                {
                    Document = _document,
                    DocumentManager = _documentManager,
                    Database = _document.Database,
                    Editor = _editor
                };

                // Execute the script synchronously (we're already on the main thread)
                object result = null;
                Exception scriptError = null;

                try
                {
                    // Run the script
                    var task = CSharpScript.EvaluateAsync<object>(
                        code,
                        GetScriptOptions(),
                        globals,
                        typeof(ScriptGlobals)
                    );

                    // Wait for completion (we're on UI thread, so this is safe)
                    result = task.GetAwaiter().GetResult();
                }
                catch (CompilationErrorException compileEx)
                {
                    // Compilation errors - return detailed diagnostics
                    var errors = string.Join("\n", compileEx.Diagnostics);
                    return new CommandExecutionResult(false, $"Compilation error:\n{errors}");
                }
                catch (Exception ex)
                {
                    scriptError = ex;
                }

                if (scriptError != null)
                {
                    return new CommandExecutionResult(false, $"Runtime error: {scriptError.Message}");
                }

                // Convert result to serializable format
                var resultData = ConvertResult(result);

                return new CommandExecutionResult(true, "Script executed successfully", resultData);
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Script execution failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Convert script result to a serializable format
        /// </summary>
        private object ConvertResult(object result)
        {
            if (result == null)
                return null;

            // Primitives and strings
            if (result is string || result is bool || result is int || result is long ||
                result is float || result is double || result is decimal)
                return result;

            // Handle (convert to string)
            if (result is Handle handle)
                return handle.ToString();

            // ObjectId (convert to handle string)
            if (result is ObjectId objectId)
                return objectId.Handle.ToString();

            // Point3d
            if (result is Point3d point)
                return new { X = point.X, Y = point.Y, Z = point.Z };

            // Collections
            if (result is IEnumerable<object> enumerable)
                return enumerable.Select(ConvertResult).ToArray();

            if (result is IEnumerable<string> strings)
                return strings.ToArray();

            if (result is IEnumerable<ObjectId> objectIds)
                return objectIds.Select(id => id.Handle.ToString()).ToArray();

            // Try to serialize as-is
            try
            {
                return JsonConvert.DeserializeObject(JsonConvert.SerializeObject(result));
            }
            catch
            {
                return result.ToString();
            }
        }
    }
}
