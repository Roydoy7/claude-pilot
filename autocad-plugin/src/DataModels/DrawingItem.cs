using System.Collections.Generic;

namespace ClaudePilot.AutoCAD.DataModels
{
    /// <summary>
    /// Represents a single item (block or entity) in the drawing
    /// </summary>
    public class DrawingItem
    {
        /// <summary>
        /// Item type: "block", "line", "circle", "polyline", "arc", "text", etc.
        /// </summary>
        public string Type { get; set; }

        /// <summary>
        /// Unique handle of the object in AutoCAD
        /// </summary>
        public string Handle { get; set; }

        /// <summary>
        /// Position in drawing coordinates [x, y]
        /// </summary>
        public double[] Position { get; set; }

        /// <summary>
        /// Bounding box: [[minX, minY], [maxX, maxY]]
        /// </summary>
        public double[][] BoundingBox { get; set; }

        /// <summary>
        /// Layer name
        /// </summary>
        public string Layer { get; set; }

        /// <summary>
        /// Type-specific data
        /// </summary>
        public object TypeData { get; set; }

        public DrawingItem()
        {
            Position = new double[2];
            BoundingBox = new double[2][];
            BoundingBox[0] = new double[2];
            BoundingBox[1] = new double[2];
        }
    }

    /// <summary>
    /// Block-specific data
    /// </summary>
    public class BlockData
    {
        /// <summary>
        /// Block's parent block name
        /// </summary>
        public string ParentBlock { get; set; }

        /// <summary>
        /// Block display name or tag
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// Rotation angle in degrees
        /// </summary>
        public double Rotation { get; set; }

        /// <summary>
        /// Scale factors [x, y, z]
        /// </summary>
        public double[] Scale { get; set; }

        /// <summary>
        /// Block attributes (key-value pairs)
        /// </summary>
        public Dictionary<string, string> Attributes { get; set; }

        public BlockData()
        {
            Scale = new double[] { 1.0, 1.0, 1.0 };
        }
    }

    /// <summary>
    /// Connection port on a block
    /// </summary>
    public class ConnectionPort
    {
        /// <summary>
        /// Port identifier
        /// </summary>
        public string Id { get; set; }

        /// <summary>
        /// Port name (e.g., "inlet", "outlet")
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// Port type: "input" or "output"
        /// </summary>
        public string Type { get; set; }

        /// <summary>
        /// Direction: "left", "right", "top", "bottom"
        /// </summary>
        public string Direction { get; set; }

        /// <summary>
        /// Position in world coordinates [x, y]
        /// </summary>
        public double[] Position { get; set; }

        /// <summary>
        /// Handle of connected entity (if any)
        /// </summary>
        public string ConnectedTo { get; set; }

        public ConnectionPort()
        {
            Position = new double[2];
        }
    }

    /// <summary>
    /// Entity-specific data (lines, circles, polylines, etc.)
    /// </summary>
    public class EntityData
    {
        /// <summary>
        /// Color index or RGB
        /// </summary>
        public string Color { get; set; }

        /// <summary>
        /// Line type (e.g., "CONTINUOUS", "DASHED")
        /// </summary>
        public string LineType { get; set; }

        /// <summary>
        /// Geometry-specific data (varies by entity type)
        /// </summary>
        public object GeometryData { get; set; }
    }

    /// <summary>
    /// Line geometry data
    /// </summary>
    public class LineGeometry
    {
        public double[] Start { get; set; }
        public double[] End { get; set; }
        public double Length { get; set; }

        public LineGeometry()
        {
            Start = new double[2];
            End = new double[2];
        }
    }

    /// <summary>
    /// Circle geometry data
    /// </summary>
    public class CircleGeometry
    {
        public double[] Center { get; set; }
        public double Radius { get; set; }

        public CircleGeometry()
        {
            Center = new double[2];
        }
    }

    /// <summary>
    /// Polyline geometry data
    /// </summary>
    public class PolylineGeometry
    {
        public List<double[]> Vertices { get; set; }
        public bool IsClosed { get; set; }
        public double TotalLength { get; set; }

        public PolylineGeometry()
        {
            Vertices = new List<double[]>();
        }
    }

    /// <summary>
    /// Text geometry data
    /// </summary>
    public class TextGeometry
    {
        public string Content { get; set; }
        public double[] Position { get; set; }
        public double Height { get; set; }
        public double Rotation { get; set; }

        public TextGeometry()
        {
            Position = new double[2];
        }
    }

    /// <summary>
    /// Arc geometry data
    /// </summary>
    public class ArcGeometry
    {
        public double[] Center { get; set; }
        public double Radius { get; set; }
        public double StartAngle { get; set; }
        public double EndAngle { get; set; }
        public double Length { get; set; }

        public ArcGeometry()
        {
            Center = new double[2];
        }
    }

    /// <summary>
    /// Ellipse geometry data
    /// </summary>
    public class EllipseGeometry
    {
        public double[] Center { get; set; }
        public double MajorRadius { get; set; }
        public double MinorRadius { get; set; }
        public double Rotation { get; set; }
        public double StartAngle { get; set; }
        public double EndAngle { get; set; }
        public bool IsClosed { get; set; }

        public EllipseGeometry()
        {
            Center = new double[2];
        }
    }

    /// <summary>
    /// Spline geometry data
    /// </summary>
    public class SplineGeometry
    {
        public List<double[]> ControlPoints { get; set; }
        public List<double[]> FitPoints { get; set; }
        public int Degree { get; set; }
        public bool IsClosed { get; set; }

        public SplineGeometry()
        {
            ControlPoints = new List<double[]>();
            FitPoints = new List<double[]>();
        }
    }

    /// <summary>
    /// Hatch geometry data
    /// </summary>
    public class HatchGeometry
    {
        public string PatternName { get; set; }
        public double PatternScale { get; set; }
        public double PatternAngle { get; set; }
        public double Area { get; set; }
        public int LoopCount { get; set; }
        public string HatchStyle { get; set; }
    }

    /// <summary>
    /// Dimension geometry data
    /// </summary>
    public class DimensionGeometry
    {
        public string DimensionType { get; set; }
        public string DimensionText { get; set; }
        public double Measurement { get; set; }
        public double[] TextPosition { get; set; }
        public string DimensionStyle { get; set; }

        public DimensionGeometry()
        {
            TextPosition = new double[2];
        }
    }

    /// <summary>
    /// Leader geometry data
    /// </summary>
    public class LeaderGeometry
    {
        public List<double[]> Vertices { get; set; }
        public string AnnotationType { get; set; }
        public string Content { get; set; }

        public LeaderGeometry()
        {
            Vertices = new List<double[]>();
        }
    }

    /// <summary>
    /// Point geometry data
    /// </summary>
    public class PointGeometry
    {
        public double[] Location { get; set; }

        public PointGeometry()
        {
            Location = new double[2];
        }
    }

    /// <summary>
    /// Solid/Region geometry data
    /// </summary>
    public class SolidGeometry
    {
        public List<double[]> Vertices { get; set; }
        public double Area { get; set; }

        public SolidGeometry()
        {
            Vertices = new List<double[]>();
        }
    }

    /// <summary>
    /// 3D Polyline geometry data
    /// </summary>
    public class Polyline3dGeometry
    {
        public List<double[]> Vertices { get; set; }
        public bool IsClosed { get; set; }
        public double TotalLength { get; set; }

        public Polyline3dGeometry()
        {
            Vertices = new List<double[]>();
        }
    }
}
