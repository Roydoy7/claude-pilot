using System;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using ClaudePilot.AutoCAD.DataModels;
using Newtonsoft.Json.Linq;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// View bounds data returned after view operations
    /// </summary>
    public class ViewBoundsData
    {
        public double[] CenterPoint { get; set; }
        public double[] MinPoint { get; set; }
        public double[] MaxPoint { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
    }

    /// <summary>
    /// Extended view data for get_view - includes current view and drawing extents
    /// </summary>
    public class ViewInfoData
    {
        /// <summary>Current view bounds</summary>
        public ViewBoundsData CurrentView { get; set; }
        /// <summary>Drawing extents (all objects bounding box)</summary>
        public ViewBoundsData DrawingExtents { get; set; }
        /// <summary>Optional screenshot of current view</summary>
        public ScreenshotData Screenshot { get; set; }
    }

    /// <summary>
    /// CommandExecutor partial class for view control commands
    /// 4 core operations: zoom_extents, zoom_window, zoom_center, pan_to_point
    /// </summary>
    public partial class CommandExecutor
    {
        /// <summary>
        /// Execute view control command
        /// </summary>
        private CommandExecutionResult ExecuteViewCommand(Command command)
        {
            switch (command.Type.ToLower())
            {
                case "get_view":
                    return GetView(command.Data);

                case "zoom_extents":
                    return ZoomExtents();

                case "zoom_window":
                    return ZoomWindow(command.Data);

                case "zoom_center":
                    return ZoomCenter(command.Data);

                case "pan_to_point":
                    return PanToPoint(command.Data);

                default:
                    return new CommandExecutionResult(false, $"Unknown view command: {command.Type}");
            }
        }

        /// <summary>
        /// Get current view bounds and drawing extents
        /// Command data format (optional):
        /// {
        ///   "includeScreenshot": true/false (optional, default: false)
        /// }
        /// </summary>
        private CommandExecutionResult GetView(object data)
        {
            try
            {
                bool includeScreenshot = false;
                if (data != null)
                {
                    var json = data as JObject ?? JObject.FromObject(data);
                    includeScreenshot = json["includeScreenshot"]?.ToObject<bool>() ?? false;
                }

                var viewInfo = new ViewInfoData
                {
                    CurrentView = GetCurrentViewBounds(),
                    DrawingExtents = GetDrawingExtents()
                };

                // Add screenshot if requested
                if (includeScreenshot)
                {
                    var extractor = new DrawingDataExtractor(_document);
                    var currentView = viewInfo.CurrentView;
                    var minPt = new Point3d(currentView.MinPoint[0], currentView.MinPoint[1], 0);
                    var maxPt = new Point3d(currentView.MaxPoint[0], currentView.MaxPoint[1], 0);
                    viewInfo.Screenshot = extractor.CaptureRegionScreenshot(minPt, maxPt);
                }

                return new CommandExecutionResult(true, "View info", viewInfo);
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Get view failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Get drawing extents (bounding box of all objects)
        /// </summary>
        private ViewBoundsData GetDrawingExtents()
        {
            Database db = _document.Database;

            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                BlockTableRecord btr = tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead) as BlockTableRecord;

                Extents3d? extents = null;
                foreach (ObjectId objId in btr)
                {
                    Entity entity = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                    if (entity != null && entity.Visible)
                    {
                        try
                        {
                            Extents3d entityExtents = entity.GeometricExtents;
                            if (!extents.HasValue)
                            {
                                extents = entityExtents;
                            }
                            else
                            {
                                extents = new Extents3d(
                                    new Point3d(
                                        Math.Min(extents.Value.MinPoint.X, entityExtents.MinPoint.X),
                                        Math.Min(extents.Value.MinPoint.Y, entityExtents.MinPoint.Y),
                                        Math.Min(extents.Value.MinPoint.Z, entityExtents.MinPoint.Z)
                                    ),
                                    new Point3d(
                                        Math.Max(extents.Value.MaxPoint.X, entityExtents.MaxPoint.X),
                                        Math.Max(extents.Value.MaxPoint.Y, entityExtents.MaxPoint.Y),
                                        Math.Max(extents.Value.MaxPoint.Z, entityExtents.MaxPoint.Z)
                                    )
                                );
                            }
                        }
                        catch { /* Some entities may not have geometric extents */ }
                    }
                }

                tr.Commit();

                if (extents.HasValue)
                {
                    Point3d minPoint = extents.Value.MinPoint;
                    Point3d maxPoint = extents.Value.MaxPoint;
                    double width = maxPoint.X - minPoint.X;
                    double height = maxPoint.Y - minPoint.Y;

                    return new ViewBoundsData
                    {
                        CenterPoint = new[] { (minPoint.X + maxPoint.X) / 2, (minPoint.Y + maxPoint.Y) / 2 },
                        MinPoint = new[] { minPoint.X, minPoint.Y },
                        MaxPoint = new[] { maxPoint.X, maxPoint.Y },
                        Width = width,
                        Height = height
                    };
                }
                else
                {
                    return null;
                }
            }
        }

        /// <summary>
        /// Get current view bounds
        /// </summary>
        private ViewBoundsData GetCurrentViewBounds()
        {
            ViewTableRecord view = _editor.GetCurrentView();
            double centerX = view.CenterPoint.X;
            double centerY = view.CenterPoint.Y;
            double width = view.Width;
            double height = view.Height;

            return new ViewBoundsData
            {
                CenterPoint = new[] { centerX, centerY },
                MinPoint = new[] { centerX - width / 2, centerY - height / 2 },
                MaxPoint = new[] { centerX + width / 2, centerY + height / 2 },
                Width = width,
                Height = height
            };
        }

        /// <summary>
        /// Zoom to show all objects in the current space (Zoom Extents)
        /// Returns the new view bounds
        /// </summary>
        private CommandExecutionResult ZoomExtents()
        {
            try
            {
                // Reuse GetDrawingExtents() which correctly calculates extents
                ViewBoundsData drawingExtents = GetDrawingExtents();

                if (drawingExtents == null)
                {
                    return new CommandExecutionResult(false, "No objects found in current space");
                }

                // Add 5% margin
                double margin = 0.05;
                double viewWidth = drawingExtents.Width * (1 + 2 * margin);
                double viewHeight = drawingExtents.Height * (1 + 2 * margin);

                ViewTableRecord view = new ViewTableRecord();
                view.CenterPoint = new Point2d(drawingExtents.CenterPoint[0], drawingExtents.CenterPoint[1]);
                view.Height = viewHeight;
                view.Width = viewWidth;

                _editor.SetCurrentView(view);

                return new CommandExecutionResult(true, "Zoom extents completed", GetCurrentViewBounds());
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Zoom extents failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Zoom to a specific window/region (Zoom Window)
        /// Command data format:
        /// {
        ///   "minPoint": [x, y],
        ///   "maxPoint": [x, y],
        ///   "margin": 0.1 (optional, adds 10% margin around the region, default: 0.1)
        /// }
        /// Returns the new view bounds
        /// </summary>
        private CommandExecutionResult ZoomWindow(object data)
        {
            try
            {
                var json = JObject.FromObject(data);

                var minX = json["minPoint"]?[0]?.ToObject<double>() ?? 0;
                var minY = json["minPoint"]?[1]?.ToObject<double>() ?? 0;
                var maxX = json["maxPoint"]?[0]?.ToObject<double>() ?? 0;
                var maxY = json["maxPoint"]?[1]?.ToObject<double>() ?? 0;
                var margin = json["margin"]?.ToObject<double>() ?? 0.1;

                // Add margin
                double width = maxX - minX;
                double height = maxY - minY;
                double marginX = width * margin;
                double marginY = height * margin;

                double minXWithMargin = minX - marginX;
                double minYWithMargin = minY - marginY;
                double maxXWithMargin = maxX + marginX;
                double maxYWithMargin = maxY + marginY;

                // Create view table record for the zoom window
                ViewTableRecord view = new ViewTableRecord();
                view.CenterPoint = new Point2d(
                    (minXWithMargin + maxXWithMargin) / 2,
                    (minYWithMargin + maxYWithMargin) / 2
                );
                view.Height = maxYWithMargin - minYWithMargin;
                view.Width = maxXWithMargin - minXWithMargin;

                _editor.SetCurrentView(view);

                return new CommandExecutionResult(true, "Zoom window completed", GetCurrentViewBounds());
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Zoom window failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Zoom with center point and scale/height (Zoom Center)
        /// Command data format:
        /// {
        ///   "centerPoint": [x, y],
        ///   "height": 100.0 (optional, keeps current if not specified),
        ///   "scale": 2.0 (optional, multiplier for current height, ignored if height is specified)
        /// }
        /// Returns the new view bounds
        /// </summary>
        private CommandExecutionResult ZoomCenter(object data)
        {
            try
            {
                var json = JObject.FromObject(data);

                var centerX = json["centerPoint"]?[0]?.ToObject<double>() ?? 0;
                var centerY = json["centerPoint"]?[1]?.ToObject<double>() ?? 0;
                var height = json["height"]?.ToObject<double>();
                var scale = json["scale"]?.ToObject<double>();

                ViewTableRecord currentView = _editor.GetCurrentView();
                ViewTableRecord view = new ViewTableRecord();
                view.CenterPoint = new Point2d(centerX, centerY);

                if (height.HasValue)
                {
                    // Use specified height, calculate width from aspect ratio
                    double aspectRatio = currentView.Width / currentView.Height;
                    view.Height = height.Value;
                    view.Width = height.Value * aspectRatio;
                }
                else if (scale.HasValue)
                {
                    // Scale current view size
                    view.Height = currentView.Height / scale.Value;
                    view.Width = currentView.Width / scale.Value;
                }
                else
                {
                    // Keep current zoom level
                    view.Height = currentView.Height;
                    view.Width = currentView.Width;
                }

                _editor.SetCurrentView(view);

                return new CommandExecutionResult(true, "Zoom center completed", GetCurrentViewBounds());
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Zoom center failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Pan the view to center on a specific point (Pan)
        /// Command data format:
        /// {
        ///   "centerPoint": [x, y]
        /// }
        /// Returns the new view bounds
        /// </summary>
        private CommandExecutionResult PanToPoint(object data)
        {
            try
            {
                var json = JObject.FromObject(data);

                var centerX = json["centerPoint"]?[0]?.ToObject<double>() ?? 0;
                var centerY = json["centerPoint"]?[1]?.ToObject<double>() ?? 0;

                ViewTableRecord currentView = _editor.GetCurrentView();
                ViewTableRecord view = new ViewTableRecord();
                view.CenterPoint = new Point2d(centerX, centerY);
                view.Height = currentView.Height;
                view.Width = currentView.Width;

                _editor.SetCurrentView(view);

                return new CommandExecutionResult(true, "Pan completed", GetCurrentViewBounds());
            }
            catch (Exception ex)
            {
                return new CommandExecutionResult(false, $"Pan failed: {ex.Message}");
            }
        }
    }
}
