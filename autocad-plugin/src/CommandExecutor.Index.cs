using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// CommandExecutor partial class for DWG index operations
    /// Provides JSON-based indexing for grep-compatible searching of DWG content
    /// </summary>
    public partial class CommandExecutor
    {
        // Base path for index storage
        private static readonly string IndexBasePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".claude-pilot",
            "AutoCAD-Assistant"
        );

        /// <summary>
        /// Execute index-related command
        /// </summary>
        public CommandExecutionResult ExecuteIndexCommand(Command command)
        {
            switch (command.Type.ToLower())
            {
                case "sync_index":
                    return SyncIndex(command.Data);

                case "get_index_path":
                    return GetIndexPath(command.Data);

                default:
                    return new CommandExecutionResult(false, "Unknown index command");
            }
        }

        /// <summary>
        /// Get the index directory path for a document
        /// </summary>
        private CommandExecutionResult GetIndexPath(object data)
        {
            try
            {
                string filePath = _document.Name;

                if (data != null)
                {
                    var json = JObject.FromObject(data);
                    var specifiedPath = json["filePath"]?.ToString();
                    if (!string.IsNullOrEmpty(specifiedPath))
                    {
                        filePath = specifiedPath;
                    }
                }

                if (string.IsNullOrEmpty(filePath))
                {
                    return new CommandExecutionResult(false, "Document has no file path (unsaved)");
                }

                string indexPath = GetIndexDirectoryPath(filePath);
                bool exists = Directory.Exists(indexPath);

                // Check if index is up to date
                bool isUpToDate = false;
                string metaPath = Path.Combine(indexPath, "meta.json");
                if (exists && File.Exists(metaPath))
                {
                    try
                    {
                        var meta = JObject.Parse(File.ReadAllText(metaPath));
                        var lastModified = meta["lastModified"]?.ToObject<DateTime>();
                        var fileInfo = new FileInfo(filePath);
                        if (lastModified.HasValue && fileInfo.Exists)
                        {
                            isUpToDate = Math.Abs((fileInfo.LastWriteTimeUtc - lastModified.Value).TotalSeconds) < 1;
                        }
                    }
                    catch { }
                }

                return new CommandExecutionResult(true, "Index path retrieved", new
                {
                    indexPath = indexPath,
                    exists = exists,
                    isUpToDate = isUpToDate,
                    entitiesFile = Path.Combine(indexPath, "entities.jsonl"),
                    metaFile = Path.Combine(indexPath, "meta.json"),
                    changesFile = Path.Combine(indexPath, "changes.jsonl")
                });
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Error getting index path: {ex.Message}");
            }
        }

        /// <summary>
        /// Synchronize the index for the current or specified document.
        /// Supports indexing external DWG files without opening them in the editor.
        /// </summary>
        private CommandExecutionResult SyncIndex(object data)
        {
            try
            {
                bool forceRebuild = false;
                string filePath = _document?.Name;

                if (data != null)
                {
                    var json = JObject.FromObject(data);
                    forceRebuild = json["forceRebuild"]?.ToObject<bool>() ?? false;
                    var specifiedPath = json["filePath"]?.ToString();
                    if (!string.IsNullOrEmpty(specifiedPath))
                    {
                        filePath = specifiedPath;
                    }
                }

                if (string.IsNullOrEmpty(filePath))
                {
                    return new CommandExecutionResult(false, "Document has no file path (unsaved)");
                }

                // Check if the file exists
                if (!File.Exists(filePath))
                {
                    return new CommandExecutionResult(false, $"File not found: {filePath}");
                }

                string indexPath = GetIndexDirectoryPath(filePath);
                string metaPath = Path.Combine(indexPath, "meta.json");
                string entitiesPath = Path.Combine(indexPath, "entities.jsonl");
                string changesPath = Path.Combine(indexPath, "changes.jsonl");

                // Check if we need to rebuild
                bool needsRebuild = forceRebuild || !File.Exists(metaPath) || !File.Exists(entitiesPath);

                if (!needsRebuild)
                {
                    // Check if file has been modified since last index
                    try
                    {
                        var meta = JObject.Parse(File.ReadAllText(metaPath));
                        var lastModified = meta["lastModified"]?.ToObject<DateTime>();
                        var fileInfo = new FileInfo(filePath);
                        if (lastModified.HasValue && fileInfo.Exists)
                        {
                            needsRebuild = Math.Abs((fileInfo.LastWriteTimeUtc - lastModified.Value).TotalSeconds) >= 1;
                        }
                        else
                        {
                            needsRebuild = true;
                        }
                    }
                    catch
                    {
                        needsRebuild = true;
                    }
                }

                if (!needsRebuild)
                {
                    return new CommandExecutionResult(true, "Index is already up to date", new
                    {
                        indexPath = indexPath,
                        rebuilt = false,
                        upToDate = true
                    });
                }

                // Create index directory
                Directory.CreateDirectory(indexPath);

                // Determine if we need to use the current document's database or read an external file
                bool isCurrentDocument = _document != null &&
                    string.Equals(Path.GetFullPath(filePath), Path.GetFullPath(_document.Name), StringComparison.OrdinalIgnoreCase);

                IndexBuildResult buildResult;

                if (isCurrentDocument)
                {
                    // Use the current document's database directly
                    buildResult = BuildIndexFromDatabase(_document.Database, filePath, entitiesPath, changesPath);
                }
                else
                {
                    // Read external DWG file without opening it in the editor
                    using (var externalDb = new Database(false, true))
                    {
                        externalDb.ReadDwgFile(filePath, FileOpenMode.OpenForReadAndAllShare, true, null);
                        buildResult = BuildIndexFromDatabase(externalDb, filePath, entitiesPath, changesPath);
                    }
                }

                if (!buildResult.Success)
                {
                    return new CommandExecutionResult(false, buildResult.ErrorMessage);
                }

                // Write meta.json
                var fileInfo2 = new FileInfo(filePath);
                var meta2 = new JObject
                {
                    ["filePath"] = filePath,
                    ["fileName"] = Path.GetFileName(filePath),
                    ["fingerprintGuid"] = buildResult.FingerprintGuid,
                    ["lastModified"] = fileInfo2.LastWriteTimeUtc.ToString("o"),
                    ["indexedAt"] = DateTime.UtcNow.ToString("o"),
                    ["entityCount"] = buildResult.EntityCount,
                    ["layerCount"] = buildResult.LayerCount,
                    ["blockDefCount"] = buildResult.BlockDefCount,
                    ["textStyleCount"] = buildResult.TextStyleCount,
                    ["dimStyleCount"] = buildResult.DimStyleCount,
                    ["linetypeCount"] = buildResult.LinetypeCount,
                    ["version"] = "1.2"
                };
                File.WriteAllText(metaPath, meta2.ToString(Formatting.Indented));

                return new CommandExecutionResult(true,
                    $"Index synchronized: {buildResult.EntityCount} entities, {buildResult.LayerCount} layers, {buildResult.BlockDefCount} blocks, {buildResult.TextStyleCount} text styles, {buildResult.DimStyleCount} dim styles, {buildResult.LinetypeCount} linetypes",
                    new
                    {
                        indexPath = indexPath,
                        rebuilt = true,
                        entityCount = buildResult.EntityCount,
                        layerCount = buildResult.LayerCount,
                        blockDefCount = buildResult.BlockDefCount,
                        textStyleCount = buildResult.TextStyleCount,
                        dimStyleCount = buildResult.DimStyleCount,
                        linetypeCount = buildResult.LinetypeCount,
                        changesDetected = buildResult.ChangesCount,
                        isExternalFile = !isCurrentDocument
                    });
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Error syncing index: {ex.Message}");
            }
        }

        /// <summary>
        /// Result of building an index from a database
        /// </summary>
        private class IndexBuildResult
        {
            public bool Success { get; set; }
            public string ErrorMessage { get; set; }
            public string FingerprintGuid { get; set; }
            public int EntityCount { get; set; }
            public int LayerCount { get; set; }
            public int BlockDefCount { get; set; }
            public int TextStyleCount { get; set; }
            public int DimStyleCount { get; set; }
            public int LinetypeCount { get; set; }
            public int ChangesCount { get; set; }
        }

        /// <summary>
        /// Build index from any Database object (current document or external file)
        /// </summary>
        private IndexBuildResult BuildIndexFromDatabase(Database db, string filePath, string entitiesPath, string changesPath)
        {
            var result = new IndexBuildResult { Success = true };

            try
            {
                result.FingerprintGuid = db.FingerprintGuid.ToString();

                var previousEntities = new System.Collections.Generic.Dictionary<string, string>();

                // Load previous entities for change detection
                if (File.Exists(entitiesPath))
                {
                    foreach (var line in File.ReadLines(entitiesPath))
                    {
                        try
                        {
                            var entity = JObject.Parse(line);
                            var handle = entity["h"]?.ToString();
                            if (!string.IsNullOrEmpty(handle))
                            {
                                previousEntities[handle] = line;
                            }
                        }
                        catch { }
                    }
                }

                var changes = new System.Collections.Generic.List<JObject>();
                var currentHandles = new System.Collections.Generic.HashSet<string>();

                using (var tr = db.TransactionManager.StartTransaction())
                {
                    // Write entities to JSONL
                    using (var writer = new StreamWriter(entitiesPath, false, Encoding.UTF8))
                    {
                        var bt = tr.GetObject(db.BlockTableId, OpenMode.ForRead) as BlockTable;

                        // Process model space and paper spaces
                        foreach (ObjectId btrId in bt)
                        {
                            var btr = tr.GetObject(btrId, OpenMode.ForRead) as BlockTableRecord;
                            if (btr == null || !btr.IsLayout)
                                continue;

                            string spaceName = btr.Name == BlockTableRecord.ModelSpace ? "MS" : btr.Name;

                            foreach (ObjectId objId in btr)
                            {
                                try
                                {
                                    var entity = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                                    if (entity == null)
                                        continue;

                                    var entityJson = SerializeEntity(entity, spaceName, tr);
                                    if (entityJson != null)
                                    {
                                        string line = entityJson.ToString(Formatting.None);
                                        writer.WriteLine(line);
                                        result.EntityCount++;

                                        string handle = entityJson["h"]?.ToString();
                                        if (!string.IsNullOrEmpty(handle))
                                        {
                                            currentHandles.Add(handle);

                                            // Detect changes
                                            if (previousEntities.TryGetValue(handle, out string prevLine))
                                            {
                                                if (prevLine != line)
                                                {
                                                    changes.Add(new JObject
                                                    {
                                                        ["op"] = "M", // Modified
                                                        ["h"] = handle,
                                                        ["t"] = entityJson["t"],
                                                        ["ts"] = DateTime.UtcNow.ToString("o")
                                                    });
                                                }
                                            }
                                            else
                                            {
                                                changes.Add(new JObject
                                                {
                                                    ["op"] = "A", // Added
                                                    ["h"] = handle,
                                                    ["t"] = entityJson["t"],
                                                    ["ts"] = DateTime.UtcNow.ToString("o")
                                                });
                                            }
                                        }
                                    }
                                }
                                catch { }
                            }
                        }

                        // Serialize layers
                        var lt = tr.GetObject(db.LayerTableId, OpenMode.ForRead) as LayerTable;
                        foreach (ObjectId layerId in lt)
                        {
                            var layer = tr.GetObject(layerId, OpenMode.ForRead) as LayerTableRecord;
                            if (layer != null)
                            {
                                result.LayerCount++;
                                var layerJson = SerializeLayer(layer, tr);
                                writer.WriteLine(layerJson.ToString(Formatting.None));
                            }
                        }

                        // Serialize block definitions
                        foreach (ObjectId btrId in bt)
                        {
                            var btr = tr.GetObject(btrId, OpenMode.ForRead) as BlockTableRecord;
                            if (btr != null && !btr.IsLayout && !btr.IsAnonymous)
                            {
                                result.BlockDefCount++;
                                var blockJson = SerializeBlockDef(btr, tr);
                                writer.WriteLine(blockJson.ToString(Formatting.None));
                            }
                        }

                        // Serialize text styles
                        var textStyleTable = tr.GetObject(db.TextStyleTableId, OpenMode.ForRead) as TextStyleTable;
                        foreach (ObjectId styleId in textStyleTable)
                        {
                            var style = tr.GetObject(styleId, OpenMode.ForRead) as TextStyleTableRecord;
                            if (style != null)
                            {
                                result.TextStyleCount++;
                                var styleJson = SerializeTextStyle(style);
                                writer.WriteLine(styleJson.ToString(Formatting.None));
                            }
                        }

                        // Serialize dimension styles
                        var dimStyleTable = tr.GetObject(db.DimStyleTableId, OpenMode.ForRead) as DimStyleTable;
                        foreach (ObjectId styleId in dimStyleTable)
                        {
                            var style = tr.GetObject(styleId, OpenMode.ForRead) as DimStyleTableRecord;
                            if (style != null)
                            {
                                result.DimStyleCount++;
                                var styleJson = SerializeDimStyle(style, tr);
                                writer.WriteLine(styleJson.ToString(Formatting.None));
                            }
                        }

                        // Serialize linetypes
                        var linetypeTable = tr.GetObject(db.LinetypeTableId, OpenMode.ForRead) as LinetypeTable;
                        foreach (ObjectId ltId in linetypeTable)
                        {
                            var linetype = tr.GetObject(ltId, OpenMode.ForRead) as LinetypeTableRecord;
                            if (linetype != null)
                            {
                                result.LinetypeCount++;
                                var ltJson = SerializeLinetype(linetype);
                                writer.WriteLine(ltJson.ToString(Formatting.None));
                            }
                        }
                    }

                    tr.Commit();
                }

                // Detect deleted entities
                foreach (var handle in previousEntities.Keys)
                {
                    if (!currentHandles.Contains(handle))
                    {
                        try
                        {
                            var prevEntity = JObject.Parse(previousEntities[handle]);
                            changes.Add(new JObject
                            {
                                ["op"] = "D", // Deleted
                                ["h"] = handle,
                                ["t"] = prevEntity["t"],
                                ["ts"] = DateTime.UtcNow.ToString("o")
                            });
                        }
                        catch { }
                    }
                }

                // Append changes to changes file
                if (changes.Count > 0)
                {
                    using (var writer = new StreamWriter(changesPath, true, Encoding.UTF8))
                    {
                        foreach (var change in changes)
                        {
                            writer.WriteLine(change.ToString(Formatting.None));
                        }
                    }
                }

                result.ChangesCount = changes.Count;
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.ErrorMessage = ex.Message;
            }

            return result;
        }

        /// <summary>
        /// Generate a hash for the file path to create unique index directory
        /// </summary>
        private string GetIndexDirectoryPath(string filePath)
        {
            using (var sha256 = SHA256.Create())
            {
                var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(filePath.ToLowerInvariant()));
                var hashString = BitConverter.ToString(hash).Replace("-", "").Substring(0, 8).ToLowerInvariant();
                return Path.Combine(IndexBasePath, hashString);
            }
        }

        /// <summary>
        /// Serialize an entity to compact JSON format
        /// Field abbreviations: h=handle, t=type, l=layer, c=color, p=position, s=space
        /// </summary>
        private JObject SerializeEntity(Entity entity, string spaceName, Transaction tr)
        {
            var json = new JObject
            {
                ["h"] = entity.Handle.ToString(),
                ["t"] = entity.GetType().Name,
                ["l"] = entity.Layer,
                ["s"] = spaceName
            };

            // Add color if not ByLayer
            if (entity.Color.IsByLayer == false)
            {
                json["c"] = entity.Color.ColorIndex;
            }

            // Add type-specific properties
            if (entity is Line line)
            {
                json["p1"] = new JArray(Math.Round(line.StartPoint.X, 4), Math.Round(line.StartPoint.Y, 4));
                json["p2"] = new JArray(Math.Round(line.EndPoint.X, 4), Math.Round(line.EndPoint.Y, 4));
            }
            else if (entity is Circle circle)
            {
                json["p"] = new JArray(Math.Round(circle.Center.X, 4), Math.Round(circle.Center.Y, 4));
                json["r"] = Math.Round(circle.Radius, 4);
            }
            else if (entity is Arc arc)
            {
                json["p"] = new JArray(Math.Round(arc.Center.X, 4), Math.Round(arc.Center.Y, 4));
                json["r"] = Math.Round(arc.Radius, 4);
                json["sa"] = Math.Round(arc.StartAngle * 180 / Math.PI, 2);
                json["ea"] = Math.Round(arc.EndAngle * 180 / Math.PI, 2);
            }
            else if (entity is DBText text)
            {
                json["p"] = new JArray(Math.Round(text.Position.X, 4), Math.Round(text.Position.Y, 4));
                json["txt"] = text.TextString;
                json["ht"] = Math.Round(text.Height, 4);
                if (text.Rotation != 0)
                    json["rot"] = Math.Round(text.Rotation * 180 / Math.PI, 2);
            }
            else if (entity is MText mtext)
            {
                json["p"] = new JArray(Math.Round(mtext.Location.X, 4), Math.Round(mtext.Location.Y, 4));
                json["txt"] = mtext.Text;
                json["ht"] = Math.Round(mtext.TextHeight, 4);
                if (mtext.Rotation != 0)
                    json["rot"] = Math.Round(mtext.Rotation * 180 / Math.PI, 2);
            }
            else if (entity is BlockReference blockRef)
            {
                json["p"] = new JArray(Math.Round(blockRef.Position.X, 4), Math.Round(blockRef.Position.Y, 4));

                var btr = tr.GetObject(blockRef.BlockTableRecord, OpenMode.ForRead) as BlockTableRecord;
                json["bn"] = btr?.Name ?? "Unknown";

                if (blockRef.Rotation != 0)
                    json["rot"] = Math.Round(blockRef.Rotation * 180 / Math.PI, 2);
                if (blockRef.ScaleFactors.X != 1 || blockRef.ScaleFactors.Y != 1)
                    json["sc"] = new JArray(Math.Round(blockRef.ScaleFactors.X, 4), Math.Round(blockRef.ScaleFactors.Y, 4));

                // Add attributes
                var attrs = new JObject();
                foreach (ObjectId attrId in blockRef.AttributeCollection)
                {
                    var attr = tr.GetObject(attrId, OpenMode.ForRead) as AttributeReference;
                    if (attr != null && !string.IsNullOrEmpty(attr.Tag))
                    {
                        attrs[attr.Tag] = attr.TextString;
                    }
                }
                if (attrs.Count > 0)
                    json["attr"] = attrs;
            }
            else if (entity is Polyline pline)
            {
                json["closed"] = pline.Closed;
                json["verts"] = pline.NumberOfVertices;

                // Store first and last point for searching
                if (pline.NumberOfVertices > 0)
                {
                    var p0 = pline.GetPoint2dAt(0);
                    json["p1"] = new JArray(Math.Round(p0.X, 4), Math.Round(p0.Y, 4));
                    if (pline.NumberOfVertices > 1)
                    {
                        var pn = pline.GetPoint2dAt(pline.NumberOfVertices - 1);
                        json["p2"] = new JArray(Math.Round(pn.X, 4), Math.Round(pn.Y, 4));
                    }
                }
            }
            else if (entity is Dimension dim)
            {
                json["dimType"] = dim.GetType().Name;
                json["txt"] = dim.DimensionText;
                // Add measurement if available
                try
                {
                    json["val"] = Math.Round(dim.Measurement, 4);
                }
                catch { }
            }
            else if (entity is Hatch hatch)
            {
                json["pat"] = hatch.PatternName;
                json["loops"] = hatch.NumberOfLoops;
            }
            else
            {
                // Generic entity - add bounding box
                try
                {
                    var extents = entity.GeometricExtents;
                    json["bb"] = new JArray(
                        new JArray(Math.Round(extents.MinPoint.X, 4), Math.Round(extents.MinPoint.Y, 4)),
                        new JArray(Math.Round(extents.MaxPoint.X, 4), Math.Round(extents.MaxPoint.Y, 4))
                    );
                }
                catch { }
            }

            return json;
        }

        /// <summary>
        /// Serialize a layer to compact JSON format
        /// </summary>
        private JObject SerializeLayer(LayerTableRecord layer, Transaction tr)
        {
            var json = new JObject
            {
                ["_type"] = "Layer",
                ["n"] = layer.Name,
                ["c"] = layer.Color.ColorIndex,
                ["on"] = !layer.IsOff,
                ["frz"] = layer.IsFrozen,
                ["lck"] = layer.IsLocked
            };

            // Linetype name
            if (layer.LinetypeObjectId.IsValid)
            {
                var linetype = tr.GetObject(layer.LinetypeObjectId, OpenMode.ForRead) as LinetypeTableRecord;
                if (linetype != null)
                    json["lt"] = linetype.Name;
            }
            else
            {
                json["lt"] = "Continuous";
            }

            // Line weight (only if not default)
            if (layer.LineWeight != LineWeight.ByLineWeightDefault && layer.LineWeight != LineWeight.LineWeight000)
            {
                json["lw"] = (int)layer.LineWeight;
            }

            // Transparency (only if not fully opaque)
            if (layer.Transparency.Alpha < 255)
            {
                json["trans"] = layer.Transparency.Alpha;
            }

            // Description (if available)
            if (!string.IsNullOrEmpty(layer.Description))
            {
                json["desc"] = layer.Description;
            }

            // Plot style name (if not default)
            if (!string.IsNullOrEmpty(layer.PlotStyleName) && layer.PlotStyleName != "Normal")
            {
                json["plotStyle"] = layer.PlotStyleName;
            }

            return json;
        }

        /// <summary>
        /// Serialize a block definition to compact JSON format
        /// </summary>
        private JObject SerializeBlockDef(BlockTableRecord btr, Transaction tr)
        {
            int entityCount = 0;
            var attrDefs = new JArray();
            var entityTypes = new System.Collections.Generic.Dictionary<string, int>();

            foreach (ObjectId id in btr)
            {
                var ent = tr.GetObject(id, OpenMode.ForRead);
                if (ent is AttributeDefinition attrDef)
                {
                    // Collect attribute definition details
                    var attrJson = new JObject
                    {
                        ["tag"] = attrDef.Tag,
                        ["prompt"] = attrDef.Prompt
                    };
                    if (!string.IsNullOrEmpty(attrDef.TextString))
                        attrJson["default"] = attrDef.TextString;
                    if (attrDef.Invisible)
                        attrJson["invis"] = true;
                    if (attrDef.Constant)
                        attrJson["const"] = true;
                    attrDefs.Add(attrJson);
                }
                else if (ent is Entity)
                {
                    entityCount++;
                    // Count entity types for block composition understanding
                    string typeName = ent.GetType().Name;
                    if (entityTypes.ContainsKey(typeName))
                        entityTypes[typeName]++;
                    else
                        entityTypes[typeName] = 1;
                }
            }

            var json = new JObject
            {
                ["_type"] = "BlockDef",
                ["n"] = btr.Name,
                ["cnt"] = entityCount,
                ["hasAttr"] = attrDefs.Count > 0
            };

            // Add entity type composition (helps understand what the block contains)
            if (entityTypes.Count > 0)
            {
                var typesJson = new JObject();
                foreach (var kvp in entityTypes)
                {
                    typesJson[kvp.Key] = kvp.Value;
                }
                json["types"] = typesJson;
            }

            // Add attribute definitions with full details
            if (attrDefs.Count > 0)
            {
                json["attrCnt"] = attrDefs.Count;
                json["attrDefs"] = attrDefs;
            }

            // Add origin if not 0,0,0
            if (btr.Origin != Point3d.Origin)
            {
                json["org"] = new JArray(
                    Math.Round(btr.Origin.X, 4),
                    Math.Round(btr.Origin.Y, 4)
                );
            }

            // Add description/comments if available
            if (!string.IsNullOrEmpty(btr.Comments))
            {
                json["desc"] = btr.Comments;
            }

            // Is it explodable?
            if (!btr.Explodable)
            {
                json["noExplode"] = true;
            }

            // Units
            if (btr.Units != UnitsValue.Undefined && btr.Units != UnitsValue.Unitless)
            {
                json["units"] = btr.Units.ToString();
            }

            return json;
        }

        /// <summary>
        /// Serialize a text style to compact JSON format
        /// </summary>
        private JObject SerializeTextStyle(TextStyleTableRecord style)
        {
            var json = new JObject
            {
                ["_type"] = "TextStyle",
                ["n"] = style.Name,
                ["font"] = style.FileName
            };

            // Add big font if present (for Asian fonts)
            if (!string.IsNullOrEmpty(style.BigFontFileName))
                json["bigFont"] = style.BigFontFileName;

            // Add text height if fixed (0 means variable)
            if (style.TextSize > 0)
                json["ht"] = Math.Round(style.TextSize, 4);

            // Add width factor if not 1.0
            if (Math.Abs(style.XScale - 1.0) > 0.001)
                json["wf"] = Math.Round(style.XScale, 4);

            // Add oblique angle if not 0
            if (Math.Abs(style.ObliquingAngle) > 0.001)
                json["oblique"] = Math.Round(style.ObliquingAngle * 180 / Math.PI, 2);

            // Add flags
            if (style.IsVertical)
                json["vert"] = true;
            if (style.FlagBits != 0)
                json["flags"] = (int)style.FlagBits;

            return json;
        }

        /// <summary>
        /// Serialize a dimension style to compact JSON format
        /// </summary>
        private JObject SerializeDimStyle(DimStyleTableRecord style, Transaction tr)
        {
            var json = new JObject
            {
                ["_type"] = "DimStyle",
                ["n"] = style.Name
            };

            // Text style reference
            if (style.Dimtxsty.IsValid)
            {
                var textStyle = tr.GetObject(style.Dimtxsty, OpenMode.ForRead) as TextStyleTableRecord;
                if (textStyle != null)
                    json["txtStyle"] = textStyle.Name;
            }

            // Key dimension parameters
            json["txtHt"] = Math.Round(style.Dimtxt, 4);      // Text height
            json["arrowSz"] = Math.Round(style.Dimasz, 4);    // Arrow size
            json["extOff"] = Math.Round(style.Dimexo, 4);     // Extension line offset
            json["extExt"] = Math.Round(style.Dimexe, 4);     // Extension line extension

            // Scale factor
            if (Math.Abs(style.Dimscale - 1.0) > 0.001)
                json["scale"] = Math.Round(style.Dimscale, 4);

            // Precision
            json["prec"] = style.Dimdec;

            // Units format
            json["units"] = style.Dimlunit;

            // Color settings if not ByBlock
            if (style.Dimclrd.ColorIndex != 0)
                json["dimClr"] = style.Dimclrd.ColorIndex;
            if (style.Dimclre.ColorIndex != 0)
                json["extClr"] = style.Dimclre.ColorIndex;
            if (style.Dimclrt.ColorIndex != 0)
                json["txtClr"] = style.Dimclrt.ColorIndex;

            return json;
        }

        /// <summary>
        /// Serialize a linetype to compact JSON format
        /// </summary>
        private JObject SerializeLinetype(LinetypeTableRecord linetype)
        {
            var json = new JObject
            {
                ["_type"] = "Linetype",
                ["n"] = linetype.Name
            };

            // Description
            if (!string.IsNullOrEmpty(linetype.Comments))
                json["desc"] = linetype.Comments;

            // Pattern length
            if (linetype.PatternLength > 0)
                json["len"] = Math.Round(linetype.PatternLength, 4);

            // Number of dashes
            json["dashes"] = linetype.NumDashes;

            return json;
        }
    }
}
