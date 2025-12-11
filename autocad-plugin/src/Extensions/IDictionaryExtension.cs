using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace ClaudePilot.AutoCAD.Extensions
{
    /// <summary>
    /// Extension methods for IDictionary.
    /// Made public to allow access from Roslyn scripts.
    /// </summary>
    public static class IDictionaryExtension
    {
        /// <summary>
        /// Get attDict's key dictionary, 
        /// the key is key's uppercase,
        /// the value is key,
        /// if BlockAttributeNameAttribute is used,
        /// use the BlockAttributeNameAttribute's PropertyName as key.
        /// O(n)
        /// </summary>
        /// <param name="attDict"></param>
        /// <returns></returns>
        public static IDictionary<string, string> GetKeys(this IDictionary<string, string> attDict)
        {
            var keyDict = new Dictionary<string, string>();
            var type = attDict.GetType();

            foreach (var key in attDict.Keys)
            {
                var prop = type.GetProperty(key);
                //No property
                if (prop == null)
                {
                    keyDict.Add(key.ToUpper(), key);
                }
                //Has same name property
                else
                {
                    //Try get attribute
                    keyDict.Add(key.ToUpper(), key);
                }
            }

            return keyDict;
        }

        public static U TryGetValueCaseless<T, U>(this IDictionary<T, U> dataDict, T key)
        {
            var targetKey = dataDict.Keys.FirstOrDefault(x => x.ToString().ToUpper() == key.ToString().ToUpper());
            if (targetKey != null)
                return dataDict[targetKey];

            return default;
        }

        public static bool ContainsKeyCaseless<T, U>(this IDictionary<T, U> dataDict, T key)
            => dataDict.Keys.Any(x => x.ToString().ToUpper() == key.ToString().ToUpper());
    }    
}