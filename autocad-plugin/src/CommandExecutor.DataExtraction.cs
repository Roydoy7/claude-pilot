using System;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using ClaudePilot.AutoCAD.DataModels;
using Newtonsoft.Json.Linq;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// CommandExecutor partial class for data extraction commands
    /// </summary>
    public partial class CommandExecutor
    {
        /// <summary>
        /// Execute data extraction command
        /// </summary>
        private CommandExecutionResult ExecuteDataExtractionCommand(Command command)
        {
            switch (command.Type.ToLower())
            {
                case "get_document_list":
                    return GetDocumentList();

                case "get_drawing_overview":
                    return GetDrawingOverview(command.Data);

                case "extract":
                    return Extract(command.Data);

                case "set_active_document":
                    return SetActiveDocument(command.Data);

                default:
                    return new CommandExecutionResult(false, "Unknown data extraction command");
            }
        }

        
        /// <summary>
        /// Get list of all open documents in AutoCAD
        /// Returns information about each document including file name, path, active status, and modification state
        /// </summary>
        private CommandExecutionResult GetDocumentList()
        {
            try
            {
                var documents = new System.Collections.Generic.List<object>();
                var docManager = Autodesk.AutoCAD.ApplicationServices.Core.Application.DocumentManager;
                var activeDoc = docManager.MdiActiveDocument;

                foreach (Document doc in docManager)
                {
                    try
                    {
                        var db = doc.Database;
                        string fileName = string.IsNullOrEmpty(doc.Name) ? "Untitled" : System.IO.Path.GetFileName(doc.Name);
                        string filePath = doc.Name ?? "";
                        bool isActive = doc == activeDoc;

                        // Check if document is modified using DBMOD system variable
                        // DBMOD = 0 means no changes, any other value means modified
                        bool isModified = false;
                        if (isActive)
                        {
                            // DBMOD only works for the active document
                            int dbmod = System.Convert.ToInt32(Autodesk.AutoCAD.ApplicationServices.Core.Application.GetSystemVariable("DBMOD"));
                            isModified = dbmod != 0;
                        }

                        // Check if file is read-only by checking file attributes
                        bool isReadOnly = false;
                        if (!string.IsNullOrEmpty(filePath) && System.IO.File.Exists(filePath))
                        {
                            var fileInfo = new System.IO.FileInfo(filePath);
                            isReadOnly = fileInfo.IsReadOnly;
                        }

                        // Get basic drawing info
                        int entityCount = 0;
                        int layerCount = 0;
                        int blockDefCount = 0;

                        using (var tr = db.TransactionManager.StartTransaction())
                        {
                            // Count layers
                            var layerTable = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;
                            if (layerTable != null)
                                layerCount = layerTable.Cast<ObjectId>().Count();

                            // Count block definitions (excluding anonymous and model/paper space)
                            var blockTable = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;
                            if (blockTable != null)
                            {
                                foreach (ObjectId btrId in blockTable)
                                {
                                    var btr = tr.GetObject(btrId, OpenMode.ForRead) as BlockTableRecord;
                                    if (btr != null && !btr.IsLayout && !btr.IsAnonymous)
                                        blockDefCount++;
                                }

                                // Count entities in model space
                                var modelSpace = tr.GetObject(blockTable[BlockTableRecord.ModelSpace], OpenMode.ForRead) as BlockTableRecord;
                                if (modelSpace != null)
                                    entityCount = modelSpace.Cast<ObjectId>().Count();
                            }

                            tr.Commit();
                        }

                        documents.Add(new
                        {
                            FileName = fileName,
                            FilePath = filePath,
                            IsActive = isActive,
                            IsModified = isModified,
                            IsReadOnly = isReadOnly,
                            DatabaseVersion = db.OriginalFileVersion.ToString(),
                            EntityCount = entityCount,
                            LayerCount = layerCount,
                            BlockDefinitionCount = blockDefCount
                        });
                    }
                    catch (System.Exception ex)
                    {
                        // If we can't read a document, add basic info with error
                        documents.Add(new
                        {
                            FileName = doc.Name ?? "Unknown",
                            FilePath = doc.Name ?? "",
                            IsActive = doc == activeDoc,
                            Error = ex.Message
                        });
                    }
                }

                // Get AutoCAD version info
                string autocadVersion = (string)Autodesk.AutoCAD.ApplicationServices.Core.Application.GetSystemVariable("ACADVER");
                int majorVersion = 0;
                var versionParts = autocadVersion.Split('.');
                if (versionParts.Length > 0)
                {
                    int.TryParse(versionParts[0], out majorVersion);
                }
                bool isNetCore = majorVersion >= 24;

                return new CommandExecutionResult(true, $"Found {documents.Count} open document(s)", new
                {
                    autocadVersion,
                    isNetCore,
                    count = documents.Count,
                    documents = documents
                });
            }
            catch (System.Exception ex)
            {
                return new CommandExecutionResult(false, $"Failed to get document list: {ex.Message}");
            }
        }

        /// <summary>
        /// Get overview of the entire drawing
        /// Command data format:
        /// {
        ///   "responseEndpoint": "http://server/api/receive-overview" (optional)
        /// }
        /// </summary>
        private CommandExecutionResult GetDrawingOverview(object data)
        {
            try
            {
                var json = JObject.FromObject(data);
                var responseEndpoint = json["responseEndpoint"]?.ToString();

                Database db = _document.Database;
                var spaces = new System.Collections.Generic.List<object>();
                var layerSummary = new System.Collections.Generic.Dictionary<string, int>();
                var blockDefSummary = new System.Collections.Generic.Dictionary<string, int>();

                using (Transaction tr = db.TransactionManager.StartTransaction())
                {
                    BlockTable bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;

                    // Collect information for each space (Model Space and Paper Spaces)
                    foreach (ObjectId btrId in bt)
                    {
                        BlockTableRecord btr = tr.GetObject(btrId, OpenMode.ForRead) as BlockTableRecord;

                        // Only process layout spaces (Model Space and Paper Spaces)
                        if (!btr.IsLayout)
                            continue;

                        string spaceName = btr.Name == BlockTableRecord.ModelSpace ? "ModelSpace" : btr.Name;

                        // Calculate extents for this space
                        Extents3d? extents = null;
                        int entityCount = 0;
                        int blockRefCount = 0;
                        var entityTypes = new System.Collections.Generic.Dictionary<string, int>();

                        foreach (ObjectId objId in btr)
                        {
                            Entity entity = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                            if (entity != null)
                            {
                                entityCount++;

                                // Count entity types
                                string typeName = entity.GetType().Name;
                                if (!entityTypes.ContainsKey(typeName))
                                    entityTypes[typeName] = 0;
                                entityTypes[typeName]++;

                                // Count block references
                                if (entity is BlockReference)
                                {
                                    blockRefCount++;
                                    BlockReference blockRef = entity as BlockReference;
                                    BlockTableRecord blockDef = tr.GetObject(blockRef.BlockTableRecord, OpenMode.ForRead) as BlockTableRecord;
                                    string blockName = blockDef.Name;
                                    if (!blockDefSummary.ContainsKey(blockName))
                                        blockDefSummary[blockName] = 0;
                                    blockDefSummary[blockName]++;
                                }

                                // Count by layer
                                string layerName = entity.Layer;
                                if (!layerSummary.ContainsKey(layerName))
                                    layerSummary[layerName] = 0;
                                layerSummary[layerName]++;

                                // Update extents
                                try
                                {
                                    if (!extents.HasValue)
                                    {
                                        extents = entity.GeometricExtents;
                                    }
                                    else
                                    {
                                        extents.Value.AddExtents(entity.GeometricExtents);
                                    }
                                }
                                catch { }
                            }
                        }

                        // Add space info
                        spaces.Add(new
                        {
                            name = spaceName,
                            isModelSpace = btr.Name == BlockTableRecord.ModelSpace,
                            entityCount = entityCount,
                            blockRefCount = blockRefCount,
                            entityTypes = entityTypes,
                            extents = extents.HasValue ? new
                            {
                                minPoint = new[] { extents.Value.MinPoint.X, extents.Value.MinPoint.Y, extents.Value.MinPoint.Z },
                                maxPoint = new[] { extents.Value.MaxPoint.X, extents.Value.MaxPoint.Y, extents.Value.MaxPoint.Z },
                                width = extents.Value.MaxPoint.X - extents.Value.MinPoint.X,
                                height = extents.Value.MaxPoint.Y - extents.Value.MinPoint.Y
                            } : null
                        });
                    }

                    // Get layer count
                    LayerTable lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;
                    int layerCount = 0;
                    foreach (ObjectId layerId in lt)
                    {
                        layerCount++;
                    }

                    // Get block definition count
                    int blockDefCount = 0;
                    foreach (ObjectId btrId in bt)
                    {
                        BlockTableRecord btr = tr.GetObject(btrId, OpenMode.ForRead) as BlockTableRecord;
                        if (!btr.IsLayout && !btr.IsAnonymous)
                        {
                            blockDefCount++;
                        }
                    }

                    tr.Commit();

                    // Prepare overview data
                    var overview = new
                    {
                        fileName = db.Filename,
                        spaces = spaces,
                        totalLayers = layerCount,
                        totalBlockDefinitions = blockDefCount,
                        layerUsage = layerSummary,
                        blockUsage = blockDefSummary,
                        units = db.Insunits.ToString()
                    };

                    // Always return data through CommandExecutionResult
                    return new CommandExecutionResult(true, "Drawing overview extracted successfully", overview);
                }
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Error getting drawing overview: {ex.Message}");
            }
        }

        /// <summary>
        /// Extract data from drawing - unified extraction method
        /// Command data format:
        /// {
        ///   "mode": "region" | "selection",
        ///   "minPoint": [x, y] (required for mode=region),
        ///   "maxPoint": [x, y] (required for mode=region),
        ///   "includeScreenshot": true/false (optional, default: false),
        ///   "entityTypes": ["DBText", "Line", "Circle", "BlockReference"] (optional, filter by entity types),
        ///   "fields": ["handle", "type", "layer", ...] (optional, filter fields to reduce response size)
        /// }
        /// </summary>
        private CommandExecutionResult Extract(object data)
        {
            try
            {
                var json = JObject.FromObject(data);
                var mode = json["mode"]?.ToString()?.ToLower();

                if (string.IsNullOrEmpty(mode))
                {
                    return new CommandExecutionResult(false, "mode parameter is required (region or selection)");
                }

                var includeScreenshot = json["includeScreenshot"]?.ToObject<bool>() ?? false;
                var fields = json["fields"]?.ToObject<string[]>();

                // Parse entity type filter
                System.Collections.Generic.List<string> entityTypeFilter = null;
                var entityTypesArray = json["entityTypes"] as JArray;
                if (entityTypesArray != null && entityTypesArray.Count > 0)
                {
                    entityTypeFilter = entityTypesArray.Select(t => t.ToString()).ToList();
                }

                DrawingDataExtractor extractor = new DrawingDataExtractor(_document);
                DrawingData drawingData;

                if (mode == "region")
                {
                    // Region extraction - requires minPoint and maxPoint
                    var minX = json["minPoint"]?[0]?.ToObject<double>() ?? 0;
                    var minY = json["minPoint"]?[1]?.ToObject<double>() ?? 0;
                    var maxX = json["maxPoint"]?[0]?.ToObject<double>() ?? 0;
                    var maxY = json["maxPoint"]?[1]?.ToObject<double>() ?? 0;

                    Point3d minPoint = new Point3d(minX, minY, 0);
                    Point3d maxPoint = new Point3d(maxX, maxY, 0);

                    drawingData = extractor.ExtractRegion(minPoint, maxPoint, includeScreenshot, false, entityTypeFilter);
                    FilterItemFields(drawingData.Items, fields);

                    // Use same response structure as selection mode for consistency
                    var responseData = new ExtractionResultData
                    {
                        ExtractedCount = drawingData.Items.Count,
                        Bounds = new BoundsData
                        {
                            MinPoint = new[] { minX, minY },
                            MaxPoint = new[] { maxX, maxY },
                            Width = maxX - minX,
                            Height = maxY - minY
                        },
                        Screenshot = drawingData.Screenshot,
                        Items = drawingData.Items,
                        BlockDefinitions = drawingData.BlockDefinitions
                    };

                    return new CommandExecutionResult(true, "Region data extracted successfully", responseData);
                }
                else if (mode == "selection")
                {
                    // Selection extraction - uses current user selection
                    PromptSelectionResult selectionResult = _editor.SelectImplied();

                    if (selectionResult.Status != PromptStatus.OK || selectionResult.Value.Count == 0)
                    {
                        return new CommandExecutionResult(false, "No entities selected");
                    }

                    SelectionSet selectionSet = selectionResult.Value;

                    // Collect ObjectIds from selection
                    var entityIds = new System.Collections.Generic.List<ObjectId>();
                    foreach (SelectedObject selObj in selectionSet)
                    {
                        if (selObj != null && selObj.ObjectId.IsValid)
                        {
                            entityIds.Add(selObj.ObjectId);
                        }
                    }

                    if (entityIds.Count == 0)
                    {
                        return new CommandExecutionResult(false, "No valid entities in selection");
                    }

                    drawingData = extractor.ExtractEntitySet(entityIds, includeScreenshot, false);

                    // Calculate bounds from extracted data
                    double minX = double.MaxValue, minY = double.MaxValue;
                    double maxX = double.MinValue, maxY = double.MinValue;

                    foreach (var item in drawingData.Items)
                    {
                        if (item.BoundingBox != null && item.BoundingBox.Length >= 2)
                        {
                            minX = Math.Min(minX, item.BoundingBox[0][0]);
                            minY = Math.Min(minY, item.BoundingBox[0][1]);
                            maxX = Math.Max(maxX, item.BoundingBox[1][0]);
                            maxY = Math.Max(maxY, item.BoundingBox[1][1]);
                        }
                    }

                    FilterItemFields(drawingData.Items, fields);

                    var responseData = new ExtractionResultData
                    {
                        SelectionCount = selectionSet.Count,
                        ExtractedCount = drawingData.Items.Count,
                        Bounds = new BoundsData
                        {
                            MinPoint = new[] { minX, minY },
                            MaxPoint = new[] { maxX, maxY },
                            Width = maxX - minX,
                            Height = maxY - minY
                        },
                        Screenshot = drawingData.Screenshot,
                        Items = drawingData.Items,
                        BlockDefinitions = drawingData.BlockDefinitions
                    };

                    return new CommandExecutionResult(true, "Selection data extracted successfully", responseData);
                }
                else
                {
                    return new CommandExecutionResult(false, $"Invalid mode: {mode}. Use 'region' or 'selection'");
                }
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Error extracting data: {ex.Message}");
            }
        }

        /// <summary>
        /// Set active document by file path or index
        /// Command data format:
        /// {
        ///   "document": "C:\\path\\to\\file.dwg" or index (0-based) in document list,
        /// }
        /// </summary>
        private CommandExecutionResult SetActiveDocument(object data)
        {
            try
            {
                var json = JObject.FromObject(data);
                var documentParam = json["document"];

                if (documentParam == null)
                {
                    return new CommandExecutionResult(false, "document parameter is required (file path or index)");
                }

                var docManager = Autodesk.AutoCAD.ApplicationServices.Core.Application.DocumentManager;
                Document targetDoc = null;
                string searchCriteria = "";

                // Try to parse as index first
                if (documentParam.Type == JTokenType.Integer || int.TryParse(documentParam.ToString(), out int index))
                {
                    int docIndex = documentParam.Type == JTokenType.Integer
                        ? documentParam.ToObject<int>()
                        : int.Parse(documentParam.ToString());

                    searchCriteria = $"index {docIndex}";

                    int currentIndex = 0;
                    foreach (Document doc in docManager)
                    {
                        if (currentIndex == docIndex)
                        {
                            targetDoc = doc;
                            break;
                        }
                        currentIndex++;
                    }

                    if (targetDoc == null)
                    {
                        return new CommandExecutionResult(false, $"Document index {docIndex} not found. Total documents: {currentIndex}");
                    }
                }
                else
                {
                    // Try to match by file path or file name
                    string documentPath = documentParam.ToString();
                    searchCriteria = documentPath;

                    foreach (Document doc in docManager)
                    {
                        // Match by full path
                        if (!string.IsNullOrEmpty(doc.Name) &&
                            doc.Name.Equals(documentPath, StringComparison.OrdinalIgnoreCase))
                        {
                            targetDoc = doc;
                            break;
                        }

                        // Match by file name only
                        if (!string.IsNullOrEmpty(doc.Name))
                        {
                            string fileName = System.IO.Path.GetFileName(doc.Name);
                            if (fileName.Equals(documentPath, StringComparison.OrdinalIgnoreCase) ||
                                fileName.Equals(System.IO.Path.GetFileName(documentPath), StringComparison.OrdinalIgnoreCase))
                            {
                                targetDoc = doc;
                                break;
                            }
                        }
                    }

                    if (targetDoc == null)
                    {
                        return new CommandExecutionResult(false, $"Document '{documentPath}' not found in open documents");
                    }
                }

                // Check if already active
                if (targetDoc == docManager.MdiActiveDocument)
                {
                    string fileName = string.IsNullOrEmpty(targetDoc.Name) ? "Untitled" : System.IO.Path.GetFileName(targetDoc.Name);
                    return new CommandExecutionResult(true, $"Document '{fileName}' is already active", new
                    {
                        fileName,
                        filePath = targetDoc.Name ?? "",
                        alreadyActive = true
                    });
                }

                // Activate the document
                docManager.MdiActiveDocument = targetDoc;

                string activeFileName = string.IsNullOrEmpty(targetDoc.Name) ? "Untitled" : System.IO.Path.GetFileName(targetDoc.Name);
                return new CommandExecutionResult(true, $"Switched to document '{activeFileName}'", new
                {
                    fileName = activeFileName,
                    filePath = targetDoc.Name ?? "",
                    alreadyActive = false
                });
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Error setting active document: {ex.Message}");
            }
        }

        /// <summary>
        /// Filter DrawingItem fields based on requested field list
        /// Nulls out fields not in the list (JsonConfig ignores nulls)
        /// </summary>
        private void FilterItemFields(System.Collections.Generic.List<DrawingItem> items, string[] fields)
        {
            if (fields == null || fields.Length == 0) return;

            var fieldSet = new System.Collections.Generic.HashSet<string>(
                fields,
                StringComparer.OrdinalIgnoreCase
            );

            foreach (var item in items)
            {
                // Core DrawingItem fields
                if (!fieldSet.Contains("handle")) item.Handle = null;
                if (!fieldSet.Contains("type")) item.Type = null;
                if (!fieldSet.Contains("layer")) item.Layer = null;
                if (!fieldSet.Contains("position")) item.Position = null;
                if (!fieldSet.Contains("boundingBox")) item.BoundingBox = null;
                if (!fieldSet.Contains("typeData")) item.TypeData = null;

                // If typeData is BlockData and we want to filter it
                if (item.TypeData is BlockData blockData)
                {
                    if (!fieldSet.Contains("name")) blockData.Name = null;
                    if (!fieldSet.Contains("rotation")) blockData.Rotation = 0;
                    if (!fieldSet.Contains("scale")) blockData.Scale = null;
                    if (!fieldSet.Contains("attributes")) blockData.Attributes = null;
                    if (!fieldSet.Contains("parentBlock")) blockData.ParentBlock = null;
                }
            }
        }
    }
}
