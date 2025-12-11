using System;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// Safe JSON converter that handles Dictionary and JToken types properly.
    /// Prevents serialization of internal JToken properties (Type, HasValues, Parent, etc.)
    /// </summary>
    public class SafeDataConverter : JsonConverter
    {
        // JToken internal property names that should not be serialized
        private static readonly HashSet<string> JTokenInternalProperties = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Type", "HasValues", "First", "Last", "Count", "Parent", "Root",
            "Next", "Previous", "Path", "Item", "IsReadOnly", "IsSynchronized", "SyncRoot"
        };

        public override bool CanConvert(Type objectType)
        {
            // Handle Dictionary types and JToken types
            return typeof(IDictionary).IsAssignableFrom(objectType) ||
                   typeof(JToken).IsAssignableFrom(objectType);
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer)
        {
            if (value == null)
            {
                writer.WriteNull();
                return;
            }

            // Handle JToken directly - write its value, not its properties
            if (value is JToken jToken)
            {
                jToken.WriteTo(writer);
                return;
            }

            // Handle Dictionary - filter out JToken internal properties
            if (value is IDictionary dict)
            {
                writer.WriteStartObject();
                foreach (DictionaryEntry entry in dict)
                {
                    string key = entry.Key?.ToString();
                    if (string.IsNullOrEmpty(key))
                        continue;

                    // Skip JToken internal properties
                    if (JTokenInternalProperties.Contains(key))
                        continue;

                    writer.WritePropertyName(key);
                    serializer.Serialize(writer, entry.Value);
                }
                writer.WriteEndObject();
                return;
            }

            // Fallback: use default serialization
            serializer.Serialize(writer, value);
        }

        public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
        {
            // Deserialization is not modified
            return serializer.Deserialize(reader, objectType);
        }

        public override bool CanRead => false;
    }
}
