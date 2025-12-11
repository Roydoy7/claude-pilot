namespace ClaudePilot.AutoCAD.DataModels
{
    /// <summary>
    /// Screenshot image data and metadata
    /// </summary>
    public class ScreenshotData
    {
        /// <summary>
        /// Base64 encoded image data (PNG format)
        /// </summary>
        public string ImageBase64 { get; set; }

        /// <summary>
        /// Image width in pixels
        /// </summary>
        public int Width { get; set; }

        /// <summary>
        /// Image height in pixels
        /// </summary>
        public int Height { get; set; }

        /// <summary>
        /// Screenshot region min point in drawing coordinates [x, y]
        /// </summary>
        public double[] MinPoint { get; set; }

        /// <summary>
        /// Screenshot region max point in drawing coordinates [x, y]
        /// </summary>
        public double[] MaxPoint { get; set; }

        /// <summary>
        /// Scale factor: how many drawing units per pixel
        /// </summary>
        public double Scale { get; set; }

        /// <summary>
        /// Screenshot format (default: "png")
        /// </summary>
        public string Format { get; set; }

        public ScreenshotData()
        {
            Format = "png";
            MinPoint = new double[2];
            MaxPoint = new double[2];
        }
    }
}
