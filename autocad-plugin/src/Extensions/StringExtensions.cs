using Autodesk.AutoCAD.Geometry;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace ClaudePilot.AutoCAD.Extensions
{
    /// <summary>
    /// Extension methods for string operations.
    /// Made public to allow access from Roslyn scripts.
    /// </summary>
    public static class StringExtensions
    {
        #region Convert Section

        public static sbyte ToInt8(this string str)
        {
            try
            {
                sbyte result = 0;
                SByte.TryParse(str, out result);
                return result;
            }
            catch
            {
                Console.WriteLine("Convert to Int 16 Exception.");
                return 0;
            }
        }

        public static short ToInt16(this string str)
        {
            try
            {
                short result = 0;
                Int16.TryParse(str, out result);
                return result;
            }
            catch
            {
                Console.WriteLine("Convert to Int 16 Exception.");
                return 0;
            }
        }

        public static int ToInt32(this string str) => ToInt(str);

        public static int ToInt(this string str)
        {
            try
            {
                int result = 0;
                int.TryParse(str, out result);
                return result;
            }
            catch
            {
                Console.WriteLine("Convert to Int Exception.");
                return 0;
            }
        }

        public static long ToInt64(this string str)
        {
            try
            {
                long result = 0;
                Int64.TryParse(str, out result);
                return result;
            }
            catch
            {
                Console.WriteLine("Convert to Int Exception.");
                return 0;
            }
        }

        public static double ToDouble(this string str)
        {
            try
            {
                var result = 0.0;
                double.TryParse(str, out result);
                return result;
            }
            catch
            {
                Console.WriteLine("Convert to Double Exception.");
                return 0;
            }
        }
        //In use.
        public static T ParseToEnum<T>(this string str) where T : struct
        {
            try
            {
                return (T)Enum.Parse(typeof(T), str);
            }
            catch
            {
                return default(T);
            }
        }

        public static bool ToBool(this string str)
        {
            try
            {
                return bool.Parse(str);
            }
            catch
            {
                Console.WriteLine("Convert to Boolean Exception.");
                return false;
            }
        }

        public static bool CanConvertToPoint3d(this string str)
        {
            var pattern = @"^\(\-?\d+(\.\d*)?(E[\+\-]?\d+)?,\-?\d+(\.\d*)?(E[\+\-]?\d+)?,\-?\d+(\.\d*)?(E[\+\-]?\d+)?\)$";
            var regex = new Regex(pattern);
            return regex.IsMatch(str);
        }

        public static Point3d ToPoint3d(this string str)
        {
            try
            {
                str = str.TrimStart('(')
                    .TrimEnd(')');
                var splits = str.Split(',');
                if(splits.Length == 3 ) 
                {
                    var x = splits[0].ToDouble();
                    var y = splits[1].ToDouble();
                    var z = splits[2].ToDouble();
                    var p = new Point3d(x, y, z);
                    return p;
                }
            }
            catch
            {                
            }

            return default;
        }
        #endregion

        public static bool IsNullOrEmpty(this string str)
        {
            return string.IsNullOrEmpty(str);
        }

        public static bool IsNullOrEmptyOrWhiteSpace(this string str)
            => string.IsNullOrEmpty(str) || string.IsNullOrWhiteSpace(str);

        public static string NormalizeString(this string str, NormalizationForm form = NormalizationForm.FormKC)
        {
            return str.Normalize(form);
        }

        /// <summary>
        /// Split a string using a char, default is space
        /// </summary>
        /// <param name="str"></param>
        /// <param name="splitChar"></param>
        /// <returns>Enum of the split string</returns>
        public static IEnumerable<string> SplitUsing(this string str, char splitChar = ' ')
        {
            var result = str.Split(splitChar);
            return result.Where(x => x != splitChar.ToString()).Where(x => string.IsNullOrEmpty(x) == false);
        }

    }
}