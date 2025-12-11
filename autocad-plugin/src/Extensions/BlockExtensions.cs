using System;
using System.Collections.Generic;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Reflection;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;

namespace ClaudePilot.AutoCAD.Extensions
{
    /// <summary>
    /// Extension methods for AutoCAD block operations.
    /// Made public to allow access from Roslyn scripts.
    /// </summary>
    public static class BlockExtensions
    {
        private static RXClass mAttributeDefClass = RXObject.GetClass(typeof(AttributeDefinition));

        /// <summary>
        /// If block reference is not dynamic block return name,
        /// if is dynamic block, return dynamic block table record name.
        /// </summary>
        /// <param name="br"></param>
        /// <returns></returns>
        private static Dictionary<ObjectId, BlockTableRecord> _GetBlockNameDict = new();
        private static Database _GetBlockNameDb;
        public static string GetBlockName(this BlockReference br)
        {
            if (!br.IsDynamicBlock)
            {
                var btr = br.BlockTableRecord.GetObject(OpenMode.ForRead) as BlockTableRecord;
                if (btr.IsAnonymous)
                {
                    //Try to get from dictionary first
                    if(_GetBlockNameDict.ContainsKey(btr.ObjectId))
                        return _GetBlockNameDict[btr.ObjectId].Name;

                    var db = btr.Database;

                    //If database has changed, clear dictionary
                    if(_GetBlockNameDb != db)
                    {
                        _GetBlockNameDb = db;
                        foreach(var kvp in _GetBlockNameDict)
                            kvp.Value.Dispose();
                        _GetBlockNameDict.Clear();
                    }

                    var bt = db.GetBlockTable(OpenMode.ForRead);
                    foreach (var item in bt)
                    {
                        var obj = item.GetObject(OpenMode.ForRead) as BlockTableRecord;
                        if (obj != null)
                        {
                            if (obj.IsDynamicBlock == false) continue;
                            using var col = obj.GetAnonymousBlockIds();
                            foreach(ObjectId id in col)
                                if (!_GetBlockNameDict.ContainsKey(id))
                                    _GetBlockNameDict.Add(id, obj);

                            if (col.Contains(btr.ObjectId))
                                return obj.Name;
                        }
                    }
                }
                return btr?.Name;
            }
            return GetDynamicBlockName(br);
        }

        public static string GetDynamicBlockName(this BlockReference br)
        {
            if (!br.IsDynamicBlock) return "";
            var btr = br.DynamicBlockTableRecord.GetObject(OpenMode.ForRead) as BlockTableRecord;
            return btr?.Name;
        }

        public static BlockTable GetBlockTable(this Database db, OpenMode openMode)
        {
            return db.BlockTableId.GetObject(openMode) as BlockTable;
        }       

        public static void SynchronizeAttributes(this BlockReference br, bool updateAnonymouseBlocks = true)
        {
            if (br.IsDynamicBlock)
            {
                if (br.DynamicBlockTableRecord.GetObject(OpenMode.ForRead) is BlockTableRecord target)
                {
                    target.SynchronizeAttributes(updateAnonymouseBlocks);
                }
            }
            else if (br.ObjectId.GetObject(OpenMode.ForRead) is BlockTableRecord target2)
            {
                target2.SynchronizeAttributes(updateAnonymouseBlocks);
            }
        }

        public static void SynchronizeAttributes(this BlockTableRecord target, bool updateAnonymouseBlocks = true)
        {
            if (target == null)
            {
                throw new ArgumentNullException("target");
            }

            Transaction topTransaction = target.Database.TransactionManager.TopTransaction;
            if (topTransaction == null)
            {
                throw new System.Exception("Transaction is not available.");
            }

            foreach (ObjectId blockReferenceId in target.GetBlockReferenceIds(directOnly: true, forceValidity: false))
            {
                BlockReference br = (BlockReference)topTransaction.GetObject(blockReferenceId, OpenMode.ForWrite);
                br.ResetAttributes(target, topTransaction);
            }

            if (!target.IsDynamicBlock)
            {
                return;
            }

            if (updateAnonymouseBlocks)
            {
                target.UpdateAnonymousBlocks();
            }

            List<AttributeDefinition> attributes = target.GetAttributes();
            foreach (ObjectId anonymousBlockId in target.GetAnonymousBlockIds())
            {
                BlockTableRecord blockTableRecord = (BlockTableRecord)topTransaction.GetObject(anonymousBlockId, OpenMode.ForRead);
                foreach (ObjectId blockReferenceId2 in blockTableRecord.GetBlockReferenceIds(directOnly: true, forceValidity: false))
                {
                    BlockReference br2 = (BlockReference)topTransaction.GetObject(blockReferenceId2, OpenMode.ForWrite);
                    br2.ResetAttributes(blockTableRecord, topTransaction, attributes);
                }
            }
        }

        private static List<AttributeDefinition> GetAttributes(this BlockTableRecord target)
        {
            List<AttributeDefinition> list = new List<AttributeDefinition>();
            foreach (ObjectId item2 in target)
            {
                if (item2.ObjectClass == mAttributeDefClass)
                {
                    AttributeDefinition item = (AttributeDefinition)item2.GetObject(OpenMode.ForRead);
                    list.Add(item);
                }
            }

            return list;
        }

        private static void ResetAttributes(this BlockReference br, BlockTableRecord btr, Transaction tr)
        {
            Database database = br.Database;
            Database workingDatabase = HostApplicationServices.WorkingDatabase;
            HostApplicationServices.WorkingDatabase = database;
            List<AttributeDefinition> attributes = btr.GetAttributes();
            Dictionary<string, string> dictionary = new Dictionary<string, string>();
            Dictionary<string, Point3d> dictionary2 = new Dictionary<string, Point3d>();
            Dictionary<string, double> dictionary3 = new Dictionary<string, double>();
            Dictionary<string, double> dictionary4 = new Dictionary<string, double>();
            foreach (ObjectId item in br.AttributeCollection)
            {
                if (!item.IsErased)
                {
                    AttributeReference attributeReference = (AttributeReference)tr.GetObject(item, OpenMode.ForWrite);
                    if (!dictionary2.ContainsKey(attributeReference.Tag))
                    {
                        dictionary2.Add(attributeReference.Tag, attributeReference.Position);
                    }

                    if (!dictionary.ContainsKey(attributeReference.Tag))
                    {
                        dictionary.Add(attributeReference.Tag, attributeReference.IsMTextAttribute ? attributeReference.MTextAttribute.Contents : attributeReference.TextString);
                    }

                    if (!dictionary3.ContainsKey(attributeReference.Tag))
                    {
                        dictionary3.Add(attributeReference.Tag, attributeReference.Rotation);
                    }

                    if (!dictionary4.ContainsKey(attributeReference.Tag))
                    {
                        dictionary4.Add(attributeReference.Tag, attributeReference.WidthFactor);
                    }

                    attributeReference.Erase();
                }
            }

            foreach (AttributeDefinition item2 in attributes)
            {
                AttributeReference attributeReference2 = new AttributeReference();
                attributeReference2.SetAttributeFromBlock(item2, br.BlockTransform);
                if (item2.Constant)
                {
                    attributeReference2.TextString = (item2.IsMTextAttributeDefinition ? item2.MTextAttributeDefinition.Contents : item2.TextString);
                }
                else if (dictionary.ContainsKey(attributeReference2.Tag))
                {
                    attributeReference2.TextString = dictionary[attributeReference2.Tag];
                }

                attributeReference2.AdjustAlignment(database);
                if (dictionary3.TryGetValue(attributeReference2.Tag, out var value))
                {
                    attributeReference2.Rotation = value;
                }

                if (dictionary4.TryGetValue(attributeReference2.Tag, out var value2))
                {
                    attributeReference2.WidthFactor = value2;
                }

                if (dictionary2.TryGetValue(attributeReference2.Tag, out var value3))
                {
                    attributeReference2.Position = value3;
                }

                br.AttributeCollection.AppendAttribute(attributeReference2);
                tr.AddNewlyCreatedDBObject(attributeReference2, add: true);
            }

            HostApplicationServices.WorkingDatabase = workingDatabase;
        }

        private static void ResetAttributes(this BlockReference br, BlockTableRecord btr, Transaction tr, List<AttributeDefinition> attDefs)
        {
            Database database = br.Database;
            Database workingDatabase = HostApplicationServices.WorkingDatabase;
            HostApplicationServices.WorkingDatabase = database;
            Dictionary<string, string> dictionary = new Dictionary<string, string>();
            Dictionary<string, Point3d> dictionary2 = new Dictionary<string, Point3d>();
            Dictionary<string, double> dictionary3 = new Dictionary<string, double>();
            Dictionary<string, double> dictionary4 = new Dictionary<string, double>();
            foreach (ObjectId item in br.AttributeCollection)
            {
                if (!item.IsErased)
                {
                    AttributeReference attributeReference = (AttributeReference)tr.GetObject(item, OpenMode.ForWrite);
                    if (!dictionary2.ContainsKey(attributeReference.Tag))
                    {
                        dictionary2.Add(attributeReference.Tag, attributeReference.Position);
                    }

                    if (!dictionary.ContainsKey(attributeReference.Tag))
                    {
                        dictionary.Add(attributeReference.Tag, attributeReference.IsMTextAttribute ? attributeReference.MTextAttribute.Contents : attributeReference.TextString);
                    }

                    if (!dictionary3.ContainsKey(attributeReference.Tag))
                    {
                        dictionary3.Add(attributeReference.Tag, attributeReference.Rotation);
                    }

                    if (!dictionary4.ContainsKey(attributeReference.Tag))
                    {
                        dictionary4.Add(attributeReference.Tag, attributeReference.WidthFactor);
                    }

                    attributeReference.Erase();
                }
            }

            HashSet<string> hashSet = new HashSet<string>();
            List<AttributeDefinition> attributes = btr.GetAttributes();
            foreach (AttributeDefinition item2 in attributes)
            {
                AttributeReference attributeReference2 = new AttributeReference();
                attributeReference2.SetAttributeFromBlock(item2, br.BlockTransform);
                if (item2.Constant)
                {
                    attributeReference2.TextString = (item2.IsMTextAttributeDefinition ? item2.MTextAttributeDefinition.Contents : item2.TextString);
                }
                else if (dictionary.ContainsKey(attributeReference2.Tag))
                {
                    attributeReference2.TextString = dictionary[attributeReference2.Tag];
                }

                attributeReference2.AdjustAlignment(database);
                if (dictionary3.TryGetValue(attributeReference2.Tag, out var value))
                {
                    attributeReference2.Rotation = value;
                }

                if (dictionary4.TryGetValue(attributeReference2.Tag, out var value2))
                {
                    attributeReference2.WidthFactor = value2;
                }

                if (dictionary2.TryGetValue(attributeReference2.Tag, out var value3))
                {
                    attributeReference2.Position = value3;
                }

                br.AttributeCollection.AppendAttribute(attributeReference2);
                tr.AddNewlyCreatedDBObject(attributeReference2, add: true);
                hashSet.Add(attributeReference2.Tag);
            }

            foreach (AttributeDefinition attDef in attDefs)
            {
                if (!hashSet.Contains(attDef.Tag))
                {
                    AttributeReference attributeReference3 = new AttributeReference();
                    attributeReference3.SetAttributeFromBlock(attDef, br.BlockTransform);
                    if (attDef.Constant)
                    {
                        attributeReference3.TextString = (attDef.IsMTextAttributeDefinition ? attDef.MTextAttributeDefinition.Contents : attDef.TextString);
                    }

                    attributeReference3.AdjustAlignment(database);
                    br.AttributeCollection.AppendAttribute(attributeReference3);
                    tr.AddNewlyCreatedDBObject(attributeReference3, add: true);
                }
            }

            HostApplicationServices.WorkingDatabase = workingDatabase;
        }

        internal static void GetBlockAttributes(AttributeCollection attCol, IDictionary<string, string> attDict, bool append = true)
        {
            //Append new key and value to dictionary
            if (append)
            {
                foreach (var item in attCol)
                {
                    if (item is ObjectId attId)
                    {
                        if (attId.IsErased) continue;
                        var attRef = attId.GetObject(OpenMode.ForRead) as AttributeReference;
                        if (attDict.ContainsKey(attRef.Tag) == false)
                            attDict.Add(attRef.Tag, attRef.TextString);
                    }
                    else if (item is AttributeReference attRef)
                    {
                        if (attRef.IsErased) continue;
                        if (attDict.ContainsKey(attRef.Tag) == false)
                            attDict.Add(attRef.Tag, attRef.TextString);
                    }
                }
            }
            //Does not append new key and value to dictionary
            else
            {
                var keys = attDict.GetKeys();
                if (keys.Count == 0)
                    return;

                foreach (var item in attCol)
                {
                    if (item is ObjectId attId)
                    {
                        if (attId.IsErased) continue;
                        var attRef = attId.GetObject(OpenMode.ForRead) as AttributeReference;
                        var tagUpper = attRef.Tag.ToUpper();
                        if (!keys.ContainsKey(tagUpper)) continue;
                        var key = keys[tagUpper];
                        attDict[key] = attRef.TextString;
                    }
                    else if (item is AttributeReference attRef)
                    {
                        if (attRef.IsErased) continue;
                        var tagUpper = attRef.Tag.ToUpper();
                        if (!keys.ContainsKey(tagUpper)) continue;
                        var key = keys[tagUpper];
                        attDict[key] = attRef.TextString;
                    }
                }
            }
        }

        /// <summary>
        /// Get block's all attributes,
        /// the key is in upper case.
        /// </summary>
        /// <param name="br"></param>
        /// <returns></returns>        
        public static IDictionary<string, string> GetBlockAttributes(this BlockReference br)
        {
            if (br == null)
                throw new ArgumentNullException("BlockReference is null.");

            var attDict = new Dictionary<string, string>(StringComparer.InvariantCultureIgnoreCase);
            var attCol = br.AttributeCollection;

            GetBlockAttributes(attCol, attDict);
            return attDict;
        }

        public static void SetBlockAttributes(this BlockReference br, IDictionary<string, string> attDict, bool adjustAlignment = true)
        {
            if (br == null)
            {
                throw new System.Exception("BlockReference is null.");
            }

            IDictionary<string, string> keys = attDict.GetKeys();
            Database database = br.Database;
            Database workingDatabase = HostApplicationServices.WorkingDatabase;
            HostApplicationServices.WorkingDatabase = database;
            foreach (ObjectId item in br.AttributeCollection)
            {
                if (item.IsErased)
                {
                    continue;
                }

                AttributeReference attributeReference = item.GetObject(OpenMode.ForWrite) as AttributeReference;
                string key = attributeReference.Tag.ToUpper();
                if (keys.ContainsKey(key))
                {
                    string key2 = keys[key];
                    string text = attDict[key2];
                    if (!string.IsNullOrEmpty(text))
                    {
                        attributeReference.TextString = text;
                    }
                    else
                    {
                        attributeReference.TextString = string.Empty;
                    }

                    if (adjustAlignment)
                    {
                        attributeReference.AdjustAlignment(database);
                    }

                    attributeReference.DowngradeOpen();
                }
            }

            HostApplicationServices.WorkingDatabase = workingDatabase;
        }

        public static void AddBlockAttributeAndValue(this BlockReference br, BlockTableRecord blockDefinition, IDictionary<string, string> attDict)
        {
            if (br == null || blockDefinition == null)
            {
                return;
            }

            if (br.Handle.Value == 0)
            {
                throw new ArgumentException("Block reference must first add to the database.");
            }

            Database database = blockDefinition.Database;
            Database workingDatabase = HostApplicationServices.WorkingDatabase;
            HostApplicationServices.WorkingDatabase = database;
            foreach (ObjectId item in blockDefinition)
            {
                DBObject dBObject = item.GetObject(OpenMode.ForRead);
                if (!(dBObject is AttributeDefinition { Constant: false } attributeDefinition))
                {
                    continue;
                }

                using AttributeReference attributeReference = new AttributeReference();
                attributeReference.SetAttributeFromBlock(attributeDefinition, br.BlockTransform);
                string text = attDict.TryGetValueCaseless(attributeReference.Tag);
                if (text != null)
                {
                    attributeReference.TextString = text;
                }

                br.AttributeCollection.AppendAttribute(attributeReference);
                attributeReference.AdjustAlignment(database);
            }

            HostApplicationServices.WorkingDatabase = workingDatabase;
        }

        public static void SetDynamicBlockAttributes(this BlockReference br, IDictionary<string, string> attData)
        {
            if (br == null)
            {
                throw new System.Exception("BlockReference is null.");
            }

            if (!br.IsDynamicBlock)
            {
                return;
            }

            DynamicBlockReferencePropertyCollection dynamicBlockReferencePropertyCollection = br.DynamicBlockReferencePropertyCollection;
            foreach (DynamicBlockReferenceProperty item in dynamicBlockReferencePropertyCollection)
            {
                if (item.ReadOnly || !attData.ContainsKeyCaseless(item.PropertyName))
                {
                    continue;
                }

                string value = attData.TryGetValueCaseless(item.PropertyName);
                if ((from x in item.GetAllowedValues()
                    select x.ToString()).Contains(value))
                {
                    object value2 = item.GetAllowedValues().First((object x) => x.ToString() == value);
                    item.Value = value2;
                }
                else if (value != null)
                {
                    item.SetDynamicAttribute(value);
                }
            }
        }

        private static void SetDynamicAttribute(this DynamicBlockReferenceProperty attRef, string value)
        {
            switch (attRef.PropertyTypeCode)
            {
                case 0:
                    break;
                case 1:
                    attRef.Value = value.ToDouble();
                    break;
                case 2:
                    attRef.Value = value.ToInt32();
                    break;
                case 3:
                    attRef.Value = value.ToInt16();
                    break;
                case 4:
                    attRef.Value = value.ToInt8();
                    break;
                case 5:
                    {
                        IEnumerable<string> source = from x in attRef.GetAllowedValues()
                                                    select x.ToString();
                        if (source.Contains(value))
                        {
                            attRef.Value = value;
                        }

                        break;
                    }
                case 12:
                    if (value.CanConvertToPoint3d())
                    {
                        attRef.Value = value.ToPoint3d();
                    }

                    break;
                case 13:
                    attRef.Value = value.ToInt64();
                    break;
                case 6:
                case 7:
                case 8:
                case 9:
                case 10:
                case 11:
                    break;
            }
        }

        public static IDictionary<string, string> GetDynamicBlockAttributes(this BlockReference br, bool isIncludeHidden = false, bool isIncludeInvisibleInCurState = false)
        {
            if (br == null)
            {
                throw new System.Exception("BlockReference is null.");
            }

            Dictionary<string, string> dictionary = new Dictionary<string, string>();
            if (!br.IsDynamicBlock)
            {
                return dictionary;
            }

            DynamicBlockReferencePropertyCollection dynamicBlockReferencePropertyCollection = br.DynamicBlockReferencePropertyCollection;
            foreach (DynamicBlockReferenceProperty item in dynamicBlockReferencePropertyCollection)
            {
                if (!item.ReadOnly && (isIncludeHidden || item.Show) && (isIncludeInvisibleInCurState || item.VisibleInCurrentVisibilityState) && !dictionary.ContainsKey(item.PropertyName))
                {
                    dictionary.Add(item.PropertyName, item.Value.ToString());
                }
            }

            return dictionary;
        }

        public static IDictionary<string, List<string>> GetDynamicBlockAttributeAllowedValues(this BlockReference br, bool isIncludeHidden = false, bool isIncludeInvisibleInCurState = false)
        {
            if (br == null)
            {
                throw new System.Exception("BlockReference is null.");
            }

            Dictionary<string, List<string>> dictionary = new Dictionary<string, List<string>>();
            if (!br.IsDynamicBlock)
            {
                return dictionary;
            }

            DynamicBlockReferencePropertyCollection dynamicBlockReferencePropertyCollection = br.DynamicBlockReferencePropertyCollection;
            foreach (DynamicBlockReferenceProperty item in dynamicBlockReferencePropertyCollection)
            {
                if (item.ReadOnly || (!isIncludeHidden && !item.Show) || (!isIncludeInvisibleInCurState && !item.VisibleInCurrentVisibilityState))
                {
                    continue;
                }

                object[] allowedValues = item.GetAllowedValues();
                if (allowedValues.Length != 0 && !dictionary.ContainsKey(item.PropertyName))
                {
                    dictionary.Add(item.PropertyName, allowedValues.Select((object x) => x.ToString()).ToList());
                }
            }

            return dictionary;
        }

        /// <summary>
        /// Copy block definitions from source database to target database.
        /// Returns a dictionary mapping source block names to target ObjectIds.
        /// </summary>
        /// <param name="targetDb">Target database to copy blocks into</param>
        /// <param name="sourceDb">Source database containing the blocks</param>
        /// <param name="blockNames">Block names to copy. If null or empty, copies all user-defined blocks.</param>
        /// <param name="overwrite">If true, overwrites existing blocks with same name</param>
        /// <returns>Dictionary mapping block names to their ObjectIds in target database</returns>
        public static IDictionary<string, ObjectId> CopyBlocksFrom(
            this Database targetDb,
            Database sourceDb,
            IEnumerable<string> blockNames = null,
            bool overwrite = false)
        {
            if (targetDb == null) throw new ArgumentNullException(nameof(targetDb));
            if (sourceDb == null) throw new ArgumentNullException(nameof(sourceDb));

            var result = new Dictionary<string, ObjectId>(StringComparer.OrdinalIgnoreCase);
            var blocksToCopy = new ObjectIdCollection();
            var nameMapping = new Dictionary<ObjectId, string>();

            using (var tr = sourceDb.TransactionManager.StartTransaction())
            {
                var sourceBt = tr.GetObject(sourceDb.BlockTableId, OpenMode.ForRead) as BlockTable;

                // Determine which blocks to copy
                IEnumerable<string> namesToCopy;
                if (blockNames == null || !blockNames.Any())
                {
                    // Copy all user-defined blocks (exclude model space, paper space, anonymous blocks)
                    namesToCopy = sourceBt.Cast<ObjectId>()
                        .Select(id => tr.GetObject(id, OpenMode.ForRead) as BlockTableRecord)
                        .Where(btr => btr != null &&
                                     !btr.IsAnonymous &&
                                     !btr.IsLayout &&
                                     !btr.Name.StartsWith("*"))
                        .Select(btr => btr.Name);
                }
                else
                {
                    namesToCopy = blockNames;
                }

                foreach (var name in namesToCopy)
                {
                    if (sourceBt.Has(name))
                    {
                        var blockId = sourceBt[name];
                        blocksToCopy.Add(blockId);
                        nameMapping[blockId] = name;
                    }
                }

                tr.Commit();
            }

            if (blocksToCopy.Count == 0)
            {
                return result;
            }

            // Check existing blocks in target and handle overwrite
            using (var tr = targetDb.TransactionManager.StartTransaction())
            {
                var targetBt = tr.GetObject(targetDb.BlockTableId, OpenMode.ForWrite) as BlockTable;

                if (overwrite)
                {
                    // Remove blocks that already exist if overwrite is true
                    var toRemove = new List<ObjectId>();
                    for (int i = 0; i < blocksToCopy.Count; i++)
                    {
                        var sourceId = blocksToCopy[i];
                        var name = nameMapping[sourceId];
                        if (targetBt.Has(name))
                        {
                            // Mark existing block for removal from copy list since we'll clone over it
                            // Actually WblockCloneObjects handles DuplicateRecordCloning
                        }
                    }
                }

                tr.Commit();
            }

            // Perform the copy using WblockCloneObjects
            var idMapping = new IdMapping();
            var cloneMode = overwrite ? DuplicateRecordCloning.Replace : DuplicateRecordCloning.Ignore;

            sourceDb.WblockCloneObjects(
                blocksToCopy,
                targetDb.BlockTableId,
                idMapping,
                cloneMode,
                false);

            // Build result dictionary with target ObjectIds
            using (var tr = targetDb.TransactionManager.StartTransaction())
            {
                var targetBt = tr.GetObject(targetDb.BlockTableId, OpenMode.ForRead) as BlockTable;

                foreach (var kvp in nameMapping)
                {
                    var name = kvp.Value;
                    if (targetBt.Has(name))
                    {
                        result[name] = targetBt[name];
                    }
                }

                tr.Commit();
            }

            return result;
        }

        /// <summary>
        /// Get block thumbnail as base64 string
        /// </summary>
        /// <param name="btr">Block table record</param>
        /// <returns>Base64 encoded PNG image, or null if no thumbnail</returns>
        public static string GetThumbnail(this BlockTableRecord btr)
        {
            try
            {
                if (btr.PreviewIcon != null)
                {
                    using (var ms = new MemoryStream())
                    {
                        btr.PreviewIcon.Save(ms, ImageFormat.Png);
                        return Convert.ToBase64String(ms.ToArray());
                    }
                }
            }
            catch
            {
                // Silently ignore thumbnail generation errors
            }

            return null;
        }

        /// <summary>
        /// Get block definition info with optional thumbnail
        /// </summary>
        /// <param name="btr">Block table record</param>
        /// <param name="includeThumbnail">Whether to include thumbnail</param>
        /// <returns>Anonymous object with block info</returns>
        public static object GetBlockDefInfo(this BlockTableRecord btr, bool includeThumbnail = false)
        {
            var attributeTags = new List<string>();

            foreach (ObjectId objId in btr)
            {
                var obj = objId.GetObject(OpenMode.ForRead);
                if (obj is AttributeDefinition attDef)
                {
                    attributeTags.Add(attDef.Tag);
                }
            }

            return new
            {
                name = btr.Name,
                hasAttributes = btr.HasAttributeDefinitions,
                isFromExternalReference = btr.IsFromExternalReference,
                isDynamic = btr.IsDynamicBlock,
                attributeCount = attributeTags.Count,
                attributeTags = attributeTags.Count > 0 ? attributeTags : null,
                thumbnail = includeThumbnail ? btr.GetThumbnail() : null
            };
        }
    }
}