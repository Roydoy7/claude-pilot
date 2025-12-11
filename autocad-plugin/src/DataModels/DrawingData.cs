using System.Collections.Generic;

namespace ClaudePilot.AutoCAD.DataModels
{
    /// <summary>
    /// Complete snapshot of a drawing region to send to LLM
    /// </summary>
    public class DrawingData
    {
        /// <summary>
        /// Screenshot of the region (optional, contains region bounds)
        /// </summary>
        public ScreenshotData Screenshot { get; set; }

        /// <summary>
        /// All items (blocks, entities) within the region
        /// </summary>
        public List<DrawingItem> Items { get; set; }

        /// <summary>
        /// Block definitions with thumbnails (key: Block Name, value: BlockDefinition)
        /// This avoids duplicating thumbnail data for multiple instances of the same block
        /// </summary>
        public Dictionary<string, BlockDefinition> BlockDefinitions { get; set; }

        /// <summary>
        /// Additional metadata
        /// </summary>
        public Dictionary<string, object> Metadata { get; set; }

        public DrawingData()
        {
            Items = new List<DrawingItem>();
            BlockDefinitions = new Dictionary<string, BlockDefinition>();
            Metadata = new Dictionary<string, object>();
        }
    }

    /// <summary>
    /// Block definition with thumbnail
    /// </summary>
    public class BlockDefinition
    {
        /// <summary>
        /// Block name
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// Block thumbnail image (base64 encoded PNG)
        /// </summary>
        public string Thumbnail { get; set; }
    }

    /// <summary>
    /// Bounding box for extracted region
    /// </summary>
    public class BoundsData
    {
        public double[] MinPoint { get; set; }
        public double[] MaxPoint { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
    }

    /// <summary>
    /// Result data for selection/region extraction commands
    /// Provides a stable structure for all extraction results
    /// </summary>
    public class ExtractionResultData
    {
        /// <summary>
        /// Number of entities in original selection
        /// </summary>
        public int SelectionCount { get; set; }

        /// <summary>
        /// Number of entities actually extracted
        /// </summary>
        public int ExtractedCount { get; set; }

        /// <summary>
        /// Bounding box of extracted entities
        /// </summary>
        public BoundsData Bounds { get; set; }

        /// <summary>
        /// Screenshot of the extracted region
        /// </summary>
        public ScreenshotData Screenshot { get; set; }

        /// <summary>
        /// Extracted items (entities and blocks)
        /// </summary>
        public List<DrawingItem> Items { get; set; }

        /// <summary>
        /// Block definitions referenced by extracted items
        /// </summary>
        public Dictionary<string, BlockDefinition> BlockDefinitions { get; set; }

        public ExtractionResultData()
        {
            Items = new List<DrawingItem>();
            BlockDefinitions = new Dictionary<string, BlockDefinition>();
        }
    }
}
