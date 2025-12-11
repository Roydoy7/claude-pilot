using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using ClaudePilot.AutoCAD.DataModels;
using ClaudePilot.AutoCAD.Extensions;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// Extracts drawing data from AutoCAD
    /// </summary>
    public class DrawingDataExtractor
    {
        // Windows API declarations for screen capture
        [DllImport("user32.dll")]
        private static extern IntPtr GetWindowDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("user32.dll")]
        private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);

        [DllImport("user32.dll")]
        private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hdc);

        private const int SRCCOPY = 0x00CC0020;
        private const uint WM_MDIGETACTIVE = 0x0229;
        private const uint PW_CLIENTONLY = 0x1;
        private const uint PW_RENDERFULLCONTENT = 0x2;

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        private readonly Document _document;
        private readonly Database _database;
        private readonly Editor _editor;

        public DrawingDataExtractor(Document document)
        {
            _document = document;
            _database = document.Database;
            _editor = document.Editor;
        }

        /// <summary>
        /// Extract drawing data from a specified region
        /// </summary>
        /// <param name="minPoint">Minimum point of region</param>
        /// <param name="maxPoint">Maximum point of region</param>
        /// <param name="includeScreenshot">Whether to capture screenshot of the region</param>
        /// <param name="includeBlockThumbnails">Whether to extract block definition thumbnails (default: false to reduce data size)</param>
        /// <param name="entityTypeFilter">Optional filter for entity types</param>
        public DrawingData ExtractRegion(Point3d minPoint, Point3d maxPoint, bool includeScreenshot = true, bool includeBlockThumbnails = false, List<string> entityTypeFilter = null)
        {
            var snapshot = new DrawingData
            {
            };

            using (Transaction tr = _database.TransactionManager.StartTransaction())
            {
                // Extract items in region
                snapshot.Items = ExtractItemsInRegion(minPoint, maxPoint, tr, includeBlockThumbnails, snapshot.BlockDefinitions, entityTypeFilter);

                // Capture screenshot if requested
                if (includeScreenshot)
                {
                    snapshot.Screenshot = CaptureRegionScreenshot(minPoint, maxPoint);
                }

                tr.Commit();
            }

            return snapshot;
        }

        /// <summary>
        /// Extract all items (blocks and entities) within the specified region
        /// </summary>
        private List<DrawingItem> ExtractItemsInRegion(Point3d minPoint, Point3d maxPoint, Transaction tr, bool includeBlockThumbnails, Dictionary<string, BlockDefinition> blockDefinitions, List<string> entityTypeFilter = null)
        {
            var items = new List<DrawingItem>();
            var extents = new Extents3d(minPoint, maxPoint);

            BlockTableRecord btr = tr.GetObject(_database.CurrentSpaceId, OpenMode.ForRead) as BlockTableRecord;

            foreach (ObjectId objId in btr)
            {
                Entity entity = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                if (entity == null) continue;

                // Apply entity type filter if specified
                if (entityTypeFilter != null && entityTypeFilter.Count > 0)
                {
                    string entityTypeName = entity.GetType().Name;
                    if (!entityTypeFilter.Contains(entityTypeName))
                        continue;
                }

                // Check if entity is within region
                try
                {
                    Extents3d entityExtents = entity.GeometricExtents;
                    if (!IsIntersecting(extents, entityExtents))
                        continue;
                }
                catch
                {
                    // Some entities may not have valid extents
                    continue;
                }

                // Extract item data based on type
                DrawingItem item = null;

                if (entity is BlockReference blockRef)
                {
                    item = ExtractBlockData(blockRef, tr, includeBlockThumbnails, blockDefinitions);
                }
                else
                {
                    item = ExtractEntityData(entity);
                }

                if (item != null)
                {
                    items.Add(item);
                }
            }

            return items;
        }

        /// <summary>
        /// Extract block reference data
        /// </summary>
        private DrawingItem ExtractBlockData(BlockReference blockRef, Transaction tr, bool includeBlockThumbnails, Dictionary<string, BlockDefinition> blockDefinitions)
        {
            var item = new DrawingItem
            {
                Type = "block",
                Handle = blockRef.Handle.ToString(),
                Position = new[] { blockRef.Position.X, blockRef.Position.Y },
                Layer = blockRef.Layer
            };

            // Get bounding box
            try
            {
                var ext = blockRef.GeometricExtents;
                item.BoundingBox = new[]
                {
                    new[] { ext.MinPoint.X, ext.MinPoint.Y },
                    new[] { ext.MaxPoint.X, ext.MaxPoint.Y }
                };
            }
            catch { }

            // Extract block-specific data
            BlockTableRecord blockDef = tr.GetObject(blockRef.BlockTableRecord, OpenMode.ForRead) as BlockTableRecord;

            var blockData = new BlockData
            {
                Name = blockRef.GetBlockName(),
                Rotation = blockRef.Rotation * 180.0 / Math.PI,
                Scale = new[] { blockRef.ScaleFactors.X, blockRef.ScaleFactors.Y, blockRef.ScaleFactors.Z }
            };

            try
            {
                blockData.ParentBlock = blockRef.BlockName;
            }
            catch
            {
                blockData.ParentBlock = "ERROR";
            }

            // Extract attributes
            if (blockRef.AttributeCollection.Count > 0)
            {
                blockData.Attributes ??= new();
                foreach (ObjectId attId in blockRef.AttributeCollection)
                {
                    AttributeReference attRef = tr.GetObject(attId, OpenMode.ForRead) as AttributeReference;
                    if (attRef != null)
                    {
                        blockData.Attributes[attRef.Tag] = attRef.TextString;
                    }
                }
            }

            // Extract thumbnail only if requested and not already cached
            // Use block name as key since ObjectId changes between sessions
            if (includeBlockThumbnails && !blockDefinitions.ContainsKey(blockDef.Name))
            {
                try
                {
                    if (blockDef.PreviewIcon != null)
                    {
                        using (var ms = new MemoryStream())
                        {
                            blockDef.PreviewIcon.Save(ms, ImageFormat.Png);
                            string thumbnailBase64 = Convert.ToBase64String(ms.ToArray());

                            blockDefinitions[blockDef.Name] = new BlockDefinition
                            {
                                Name = blockDef.Name,
                                Thumbnail = thumbnailBase64
                            };
                        }
                    }
                }
                catch { }
            }

            item.TypeData = blockData;
            return item;
        }

        /// <summary>
        /// Extract entity data (line, circle, polyline, etc.)
        /// </summary>
        private DrawingItem ExtractEntityData(Entity entity)
        {
            var item = new DrawingItem
            {
                Handle = entity.Handle.ToString(),
                Layer = entity.Layer
            };

            // Get position (approximate center)
            try
            {
                var ext = entity.GeometricExtents;
                item.Position = new[]
                {
                    (ext.MinPoint.X + ext.MaxPoint.X) / 2,
                    (ext.MinPoint.Y + ext.MaxPoint.Y) / 2
                };
                item.BoundingBox = new[]
                {
                    new[] { ext.MinPoint.X, ext.MinPoint.Y },
                    new[] { ext.MaxPoint.X, ext.MaxPoint.Y }
                };
            }
            catch { }

            var entityData = new EntityData
            {
                Color = entity.Color.ColorIndex.ToString(),
                LineType = entity.Linetype
            };

            // Extract geometry based on entity type
            if (entity is Line line)
            {
                item.Type = "line";
                entityData.GeometryData = new LineGeometry
                {
                    Start = new[] { line.StartPoint.X, line.StartPoint.Y },
                    End = new[] { line.EndPoint.X, line.EndPoint.Y },
                    Length = line.Length
                };
            }
            else if (entity is Circle circle)
            {
                item.Type = "circle";
                entityData.GeometryData = new CircleGeometry
                {
                    Center = new[] { circle.Center.X, circle.Center.Y },
                    Radius = circle.Radius
                };
            }
            else if (entity is Polyline pline)
            {
                item.Type = "polyline";
                var vertices = new List<double[]>();
                for (int i = 0; i < pline.NumberOfVertices; i++)
                {
                    Point2d pt = pline.GetPoint2dAt(i);
                    vertices.Add(new[] { pt.X, pt.Y });
                }
                entityData.GeometryData = new PolylineGeometry
                {
                    Vertices = vertices,
                    IsClosed = pline.Closed,
                    TotalLength = pline.Length
                };
            }
            else if (entity is DBText text)
            {
                item.Type = "text";
                entityData.GeometryData = new TextGeometry
                {
                    Content = text.TextString,
                    Position = new[] { text.Position.X, text.Position.Y },
                    Height = text.Height,
                    Rotation = text.Rotation * 180.0 / Math.PI
                };
            }
            else if (entity is MText mtext)
            {
                item.Type = "mtext";
                entityData.GeometryData = new TextGeometry
                {
                    Content = mtext.Text,
                    Position = new[] { mtext.Location.X, mtext.Location.Y },
                    Height = mtext.TextHeight,
                    Rotation = mtext.Rotation * 180.0 / Math.PI
                };
            }
            else if (entity is Arc arc)
            {
                item.Type = "arc";
                entityData.GeometryData = new ArcGeometry
                {
                    Center = new[] { arc.Center.X, arc.Center.Y },
                    Radius = arc.Radius,
                    StartAngle = arc.StartAngle * 180.0 / Math.PI,
                    EndAngle = arc.EndAngle * 180.0 / Math.PI,
                    Length = arc.Length
                };
            }
            else if (entity is Ellipse ellipse)
            {
                item.Type = "ellipse";
                double majorRadius = ellipse.MajorRadius;
                double minorRadius = ellipse.MinorRadius;
                double rotation = Math.Atan2(ellipse.MajorAxis.Y, ellipse.MajorAxis.X) * 180.0 / Math.PI;
                entityData.GeometryData = new EllipseGeometry
                {
                    Center = new[] { ellipse.Center.X, ellipse.Center.Y },
                    MajorRadius = majorRadius,
                    MinorRadius = minorRadius,
                    Rotation = rotation,
                    StartAngle = ellipse.StartAngle * 180.0 / Math.PI,
                    EndAngle = ellipse.EndAngle * 180.0 / Math.PI,
                    IsClosed = Math.Abs(ellipse.EndAngle - ellipse.StartAngle - Math.PI * 2) < 0.001
                };
            }
            else if (entity is Spline spline)
            {
                item.Type = "spline";
                var controlPoints = new List<double[]>();
                var fitPoints = new List<double[]>();

                // Get control points
                for (int i = 0; i < spline.NumControlPoints; i++)
                {
                    Point3d pt = spline.GetControlPointAt(i);
                    controlPoints.Add(new[] { pt.X, pt.Y });
                }

                // Get fit points if available
                if (spline.NumFitPoints > 0)
                {
                    for (int i = 0; i < spline.NumFitPoints; i++)
                    {
                        Point3d pt = spline.GetFitPointAt(i);
                        fitPoints.Add(new[] { pt.X, pt.Y });
                    }
                }

                entityData.GeometryData = new SplineGeometry
                {
                    ControlPoints = controlPoints,
                    FitPoints = fitPoints,
                    Degree = spline.Degree,
                    IsClosed = spline.Closed
                };
            }
            else if (entity is Hatch hatch)
            {
                item.Type = "hatch";
                entityData.GeometryData = new HatchGeometry
                {
                    PatternName = hatch.PatternName,
                    PatternScale = hatch.PatternScale,
                    PatternAngle = hatch.PatternAngle * 180.0 / Math.PI,
                    Area = hatch.Area,
                    LoopCount = hatch.NumberOfLoops,
                    HatchStyle = hatch.HatchStyle.ToString()
                };
            }
            else if (entity is Dimension dim)
            {
                item.Type = "dimension";
                string dimType = dim.GetType().Name;
                entityData.GeometryData = new DimensionGeometry
                {
                    DimensionType = dimType,
                    DimensionText = dim.DimensionText,
                    Measurement = dim.Measurement,
                    TextPosition = new[] { dim.TextPosition.X, dim.TextPosition.Y },
                    DimensionStyle = dim.DimensionStyleName
                };
            }
            else if (entity is Leader leader)
            {
                item.Type = "leader";
                var vertices = new List<double[]>();
                // Leader uses VertexAt method, not GetVertexAt
                for (int i = 0; i < leader.NumVertices; i++)
                {
                    Point3d pt = leader.VertexAt(i);
                    vertices.Add(new[] { pt.X, pt.Y });
                }
                entityData.GeometryData = new LeaderGeometry
                {
                    Vertices = vertices,
                    AnnotationType = leader.AnnoType.ToString(),
                    Content = leader.Annotation.ToString()
                };
            }
            else if (entity is DBPoint point)
            {
                item.Type = "point";
                entityData.GeometryData = new PointGeometry
                {
                    Location = new[] { point.Position.X, point.Position.Y }
                };
            }
            else if (entity is Solid solid)
            {
                item.Type = "solid";
                var vertices = new List<double[]>();
                for (short i = 0; i < 4; i++)
                {
                    Point3d pt = solid.GetPointAt(i);
                    vertices.Add(new[] { pt.X, pt.Y });
                }
                entityData.GeometryData = new SolidGeometry
                {
                    Vertices = vertices
                };
            }
            else if (entity is Polyline3d pline3d)
            {
                item.Type = "polyline3d";
                var vertices = new List<double[]>();
                foreach (ObjectId vertexId in pline3d)
                {
                    using (var vertex = vertexId.GetObject(OpenMode.ForRead) as PolylineVertex3d)
                    {
                        if (vertex != null)
                        {
                            vertices.Add(new[] { vertex.Position.X, vertex.Position.Y, vertex.Position.Z });
                        }
                    }
                }
                entityData.GeometryData = new Polyline3dGeometry
                {
                    Vertices = vertices,
                    IsClosed = pline3d.Closed,
                    TotalLength = pline3d.Length
                };
            }
            else if (entity is Polyline2d pline2d)
            {
                item.Type = "polyline2d";
                var vertices = new List<double[]>();
                foreach (ObjectId vertexId in pline2d)
                {
                    using (var vertex = vertexId.GetObject(OpenMode.ForRead) as Vertex2d)
                    {
                        if (vertex != null)
                        {
                            vertices.Add(new[] { vertex.Position.X, vertex.Position.Y });
                        }
                    }
                }
                entityData.GeometryData = new PolylineGeometry
                {
                    Vertices = vertices,
                    IsClosed = pline2d.Closed,
                    TotalLength = pline2d.Length
                };
            }
            else if (entity is Ray ray)
            {
                item.Type = "ray";
                entityData.GeometryData = new LineGeometry
                {
                    Start = new[] { ray.BasePoint.X, ray.BasePoint.Y },
                    End = new[] { ray.BasePoint.X + ray.UnitDir.X * 1000, ray.BasePoint.Y + ray.UnitDir.Y * 1000 }
                };
            }
            else if (entity is Xline xline)
            {
                item.Type = "xline";
                entityData.GeometryData = new LineGeometry
                {
                    Start = new[] { xline.BasePoint.X - xline.UnitDir.X * 1000, xline.BasePoint.Y - xline.UnitDir.Y * 1000 },
                    End = new[] { xline.BasePoint.X + xline.UnitDir.X * 1000, xline.BasePoint.Y + xline.UnitDir.Y * 1000 }
                };
            }
            else
            {
                // For unsupported types, just record the type name
                item.Type = entity.GetType().Name.ToLowerInvariant();
            }

            item.TypeData = entityData;
            return item;
        }

        /// <summary>
        /// Capture screenshot of the specified region without changing the view
        /// </summary>
        internal ScreenshotData CaptureRegionScreenshot(Point3d minPoint, Point3d maxPoint)
        {
            try
            {
                // Get current view parameters
                ViewTableRecord view = _editor.GetCurrentView();

                // Capture the entire editor window
                Bitmap fullScreenshot = CaptureActiveView();
                if (fullScreenshot == null)
                {
                    return null;
                }

                // Calculate the transformation from world coordinates to screen pixels
                // View parameters:
                // - CenterPoint: center of the view in world coordinates
                // - Width: view width in world units
                // - Height: view height in world units
                // Screen parameters:
                // - fullScreenshot.Width: screen width in pixels
                // - fullScreenshot.Height: screen height in pixels

                double viewCenterX = view.CenterPoint.X;
                double viewCenterY = view.CenterPoint.Y;
                double viewWidth = view.Width;
                double viewHeight = view.Height;

                int screenWidth = fullScreenshot.Width;
                int screenHeight = fullScreenshot.Height;

                // Calculate pixels per world unit
                // Use unified scale to maintain aspect ratio
                // AutoCAD view maintains aspect ratio, so we need to find the actual visible area
                double pixelsPerUnitX = screenWidth / viewWidth;
                double pixelsPerUnitY = screenHeight / viewHeight;

                // Use the minimum scale factor to ensure we're within the visible area
                // This accounts for the fact that AutoCAD may letterbox the view
                double pixelsPerUnit = Math.Min(pixelsPerUnitX, pixelsPerUnitY);

                // Calculate the offset if view is letterboxed
                double actualViewWidthPixels = viewWidth * pixelsPerUnit;
                double actualViewHeightPixels = viewHeight * pixelsPerUnit;
                double offsetX = (screenWidth - actualViewWidthPixels) / 2;
                double offsetY = (screenHeight - actualViewHeightPixels) / 2;

                // Convert world coordinates to screen coordinates
                // Screen origin (0,0) is at top-left
                // World origin relative to view center
                int minScreenX = (int)((minPoint.X - viewCenterX) * pixelsPerUnit + screenWidth / 2);
                int maxScreenX = (int)((maxPoint.X - viewCenterX) * pixelsPerUnit + screenWidth / 2);

                // Y is inverted (screen Y increases downward, world Y increases upward)
                int minScreenY = (int)((viewCenterY - maxPoint.Y) * pixelsPerUnit + screenHeight / 2);
                int maxScreenY = (int)((viewCenterY - minPoint.Y) * pixelsPerUnit + screenHeight / 2);

                // Clamp to screen bounds
                minScreenX = Math.Max(0, Math.Min(minScreenX, screenWidth));
                maxScreenX = Math.Max(0, Math.Min(maxScreenX, screenWidth));
                minScreenY = Math.Max(0, Math.Min(minScreenY, screenHeight));
                maxScreenY = Math.Max(0, Math.Min(maxScreenY, screenHeight));

                int cropWidth = maxScreenX - minScreenX;
                int cropHeight = maxScreenY - minScreenY;

                if (cropWidth <= 0 || cropHeight <= 0)
                {
                    fullScreenshot.Dispose();
                    return null;
                }

                // Crop the bitmap to the desired region
                Bitmap croppedScreenshot = new Bitmap(cropWidth, cropHeight, PixelFormat.Format24bppRgb);
                using (Graphics g = Graphics.FromImage(croppedScreenshot))
                {
                    g.DrawImage(fullScreenshot,
                        new Rectangle(0, 0, cropWidth, cropHeight),
                        new Rectangle(minScreenX, minScreenY, cropWidth, cropHeight),
                        GraphicsUnit.Pixel);
                }

                // DEBUG: Save screenshots for debugging
                try
                {
                    string debugFolder = Path.Combine(Path.GetTempPath(), "AutoCAD_Screenshots");
                    Directory.CreateDirectory(debugFolder);

                    string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");

                    // Save full screenshot with crop rectangle marked
                    using (Bitmap debugBitmap = new Bitmap(fullScreenshot))
                    using (Graphics g = Graphics.FromImage(debugBitmap))
                    {
                        // Draw rectangle showing the crop area
                        using (Pen redPen = new Pen(Color.Red, 3))
                        {
                            g.DrawRectangle(redPen, minScreenX, minScreenY, cropWidth, cropHeight);
                        }

                        // Draw diagonal lines to make it more visible
                        using (Pen yellowPen = new Pen(Color.Yellow, 2))
                        {
                            g.DrawLine(yellowPen, minScreenX, minScreenY, maxScreenX, maxScreenY);
                            g.DrawLine(yellowPen, maxScreenX, minScreenY, minScreenX, maxScreenY);
                        }

                        string fullPath = Path.Combine(debugFolder, $"full_{timestamp}.png");
                        debugBitmap.Save(fullPath, ImageFormat.Png);
                    }

                    // Save cropped screenshot
                    string cropPath = Path.Combine(debugFolder, $"crop_{timestamp}.png");
                    croppedScreenshot.Save(cropPath, ImageFormat.Png);
                }
                catch
                {
                }

                fullScreenshot.Dispose();

                // Optimize screenshot
                croppedScreenshot = OptimizeScreenshot(croppedScreenshot);

                // Convert to base64
                using (var ms = new MemoryStream())
                {
                    croppedScreenshot.Save(ms, ImageFormat.Png);
                    byte[] imageBytes = ms.ToArray();

                    return new ScreenshotData
                    {
                        ImageBase64 = Convert.ToBase64String(imageBytes),
                        Width = croppedScreenshot.Width,
                        Height = croppedScreenshot.Height,
                        MinPoint = new[] { minPoint.X, minPoint.Y },
                        MaxPoint = new[] { maxPoint.X, maxPoint.Y },
                        Scale = (maxPoint.X - minPoint.X) / croppedScreenshot.Width,
                        Format = "png"
                    };
                }
            }
            catch
            {
            }

            return null;
        }

        /// <summary>
        /// Capture the active AutoCAD view by finding the active document's editor window
        /// </summary>
        private Bitmap CaptureActiveView()
        {
            try
            {
                // Get AutoCAD main window handle
                IntPtr acadMainWindow = Autodesk.AutoCAD.ApplicationServices.Application.MainWindow.Handle;

                // Find the MDIClient window
                IntPtr mdiClient = FindWindowEx(acadMainWindow, IntPtr.Zero, "MDIClient", null);
                if (mdiClient == IntPtr.Zero)
                {
                    return null;
                }

                // Get the active MDI child window (current document)
                IntPtr activeDocWindow = SendMessage(mdiClient, WM_MDIGETACTIVE, IntPtr.Zero, IntPtr.Zero);
                if (activeDocWindow == IntPtr.Zero)
                {
                    return null;
                }

                // Find the Afx container window (first child of the document window)
                // It has a class name starting with "Afx"
                IntPtr afxContainer = IntPtr.Zero;
                IntPtr childWindow = FindWindowEx(activeDocWindow, IntPtr.Zero, null, null);

                while (childWindow != IntPtr.Zero)
                {
                    // Get the class name of this child window
                    System.Text.StringBuilder className = new System.Text.StringBuilder(256);
                    GetClassName(childWindow, className, className.Capacity);

                    if (className.ToString().StartsWith("Afx"))
                    {
                        afxContainer = childWindow;
                        break;
                    }

                    // Get next sibling
                    childWindow = FindWindowEx(activeDocWindow, childWindow, null, null);
                }

                if (afxContainer == IntPtr.Zero)
                {
                    return null;
                }

                // Find the ACADDM_CHILD_DXGI_FLIP_MODE_VIEW_CLASS window under the Afx container
                IntPtr editorWindow = FindWindowEx(afxContainer, IntPtr.Zero, "ACADDM_CHILD_DXGI_FLIP_MODE_VIEW_CLASS", null);
                if (editorWindow == IntPtr.Zero)
                {
                    return null;
                }

                // Get the client rectangle of the editor window
                RECT clientRect;
                if (!GetClientRect(editorWindow, out clientRect))
                {
                    return null;
                }

                int windowWidth = clientRect.Right - clientRect.Left;
                int windowHeight = clientRect.Bottom - clientRect.Top;

                // Use PrintWindow API to capture window content directly from rendering buffer
                // This avoids the occlusion problem of Graphics.CopyFromScreen

                // Get window DC
                IntPtr windowDC = GetWindowDC(editorWindow);
                if (windowDC == IntPtr.Zero)
                {
                    return null;
                }

                try
                {
                    // Create a compatible DC and bitmap
                    IntPtr memDC = CreateCompatibleDC(windowDC);
                    if (memDC == IntPtr.Zero)
                    {
                        ReleaseDC(editorWindow, windowDC);
                        return null;
                    }

                    try
                    {
                        IntPtr hBitmap = CreateCompatibleBitmap(windowDC, windowWidth, windowHeight);
                        if (hBitmap == IntPtr.Zero)
                        {
                            DeleteDC(memDC);
                            ReleaseDC(editorWindow, windowDC);
                            return null;
                        }

                        try
                        {
                            // Select bitmap into memory DC
                            IntPtr oldBitmap = SelectObject(memDC, hBitmap);

                            // Use PrintWindow to capture the window content
                            // PW_RENDERFULLCONTENT ensures we get the full content even if occluded
                            bool success = PrintWindow(editorWindow, memDC, PW_RENDERFULLCONTENT);

                            if (!success)
                            {
                                // Fallback to PW_CLIENTONLY if PW_RENDERFULLCONTENT fails
                                success = PrintWindow(editorWindow, memDC, PW_CLIENTONLY);
                            }

                            // Restore old bitmap
                            SelectObject(memDC, oldBitmap);

                            if (!success)
                            {
                                DeleteObject(hBitmap);
                                DeleteDC(memDC);
                                ReleaseDC(editorWindow, windowDC);
                                return null;
                            }

                            // Convert GDI bitmap to managed Bitmap
                            Bitmap bitmap = System.Drawing.Image.FromHbitmap(hBitmap);

                            // Clean up GDI resources
                            DeleteObject(hBitmap);

                            return bitmap;
                        }
                        catch
                        {
                            DeleteObject(hBitmap);
                            throw;
                        }
                    }
                    finally
                    {
                        DeleteDC(memDC);
                    }
                }
                finally
                {
                    ReleaseDC(editorWindow, windowDC);
                }
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Optimize screenshot for LLM (crop, compress, etc.)
        /// </summary>
        private Bitmap OptimizeScreenshot(Bitmap original)
        {
            // TODO: Implement optimization
            // - Auto crop whitespace
            // - Convert to indexed color
            // - Resize if too large
            return original;
        }

        /// <summary>
        /// Check if two extents intersect
        /// </summary>
        private bool IsIntersecting(Extents3d ext1, Extents3d ext2)
        {
            return !(ext1.MaxPoint.X < ext2.MinPoint.X ||
                     ext1.MinPoint.X > ext2.MaxPoint.X ||
                     ext1.MaxPoint.Y < ext2.MinPoint.Y ||
                     ext1.MinPoint.Y > ext2.MaxPoint.Y);
        }

        /// <summary>
        /// Extract drawing data from a specific set of entities
        /// </summary>
        /// <param name="entityIds">List of entity ObjectIds to extract</param>
        /// <param name="includeScreenshot">Whether to capture screenshot of the region</param>
        /// <param name="includeBlockThumbnails">Whether to extract block definition thumbnails</param>
        public DrawingData ExtractEntitySet(IEnumerable<ObjectId> entityIds, bool includeScreenshot = true, bool includeBlockThumbnails = false)
        {
            var snapshot = new DrawingData
            {
            };

            Extents3d? combinedBounds = null;

            using (Transaction tr = _database.TransactionManager.StartTransaction())
            {
                // Extract items from the specific entity set
                snapshot.Items = ExtractItemsFromEntitySet(entityIds, tr, includeBlockThumbnails, snapshot.BlockDefinitions, out combinedBounds);

                // Capture screenshot if requested and we have valid bounds
                if (includeScreenshot && combinedBounds.HasValue)
                {
                    snapshot.Screenshot = CaptureRegionScreenshot(combinedBounds.Value.MinPoint, combinedBounds.Value.MaxPoint);
                }

                tr.Commit();
            }

            return snapshot;
        }

        /// <summary>
        /// Extract items from a specific set of entities
        /// </summary>
        private List<DrawingItem> ExtractItemsFromEntitySet(IEnumerable<ObjectId> entityIds, Transaction tr, bool includeBlockThumbnails, Dictionary<string, BlockDefinition> blockDefinitions, out Extents3d? combinedBounds)
        {
            var items = new List<DrawingItem>();
            combinedBounds = null;

            foreach (ObjectId objId in entityIds)
            {
                if (!objId.IsValid || objId.IsErased)
                    continue;

                Entity entity = tr.GetObject(objId, OpenMode.ForRead) as Entity;
                if (entity == null) continue;

                // Update combined bounds
                try
                {
                    Extents3d entityExtents = entity.GeometricExtents;
                    if (combinedBounds.HasValue)
                    {
                        combinedBounds = new Extents3d(
                            new Point3d(
                                Math.Min(combinedBounds.Value.MinPoint.X, entityExtents.MinPoint.X),
                                Math.Min(combinedBounds.Value.MinPoint.Y, entityExtents.MinPoint.Y),
                                Math.Min(combinedBounds.Value.MinPoint.Z, entityExtents.MinPoint.Z)
                            ),
                            new Point3d(
                                Math.Max(combinedBounds.Value.MaxPoint.X, entityExtents.MaxPoint.X),
                                Math.Max(combinedBounds.Value.MaxPoint.Y, entityExtents.MaxPoint.Y),
                                Math.Max(combinedBounds.Value.MaxPoint.Z, entityExtents.MaxPoint.Z)
                            )
                        );
                    }
                    else
                    {
                        combinedBounds = entityExtents;
                    }
                }
                catch
                {
                    // Some entities might not have extents
                }

                // Extract item data based on type
                DrawingItem item = null;

                if (entity is BlockReference blockRef)
                {
                    item = ExtractBlockData(blockRef, tr, includeBlockThumbnails, blockDefinitions);
                }
                else
                {
                    item = ExtractEntityData(entity);
                }

                if (item != null)
                {
                    items.Add(item);
                }
            }

            return items;
        }
    }
}
