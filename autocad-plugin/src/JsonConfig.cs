using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System;
using System.Globalization;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// JSON serialization configuration for AutoCAD plugin
    /// Optimizes output for token efficiency
    /// </summary>
    public static class JsonConfig
    {
        /// <summary>
        /// Default JSON serializer settings with optimizations:
        /// - 4 decimal places for floating point numbers
        /// - Ignore null values
        /// - Ignore default values for value types
        /// - Camel case property names
        /// - Safe handling of Dictionary and JToken types
        /// </summary>
        public static JsonSerializerSettings DefaultSettings { get; } = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore,
            Formatting = Formatting.None,
            ReferenceLoopHandling = ReferenceLoopHandling.Ignore,
            ContractResolver = new DefaultContractResolver
            {
                NamingStrategy = new CamelCaseNamingStrategy()
            },
            Converters = { new RoundedDoubleConverter(4), new SafeDataConverter() }
        };

        /// <summary>
        /// Serialize object to JSON string with optimized settings
        /// </summary>
        public static string Serialize(object obj)
        {
            return JsonConvert.SerializeObject(obj, DefaultSettings);
        }

        /// <summary>
        /// Deserialize JSON string to object
        /// </summary>
        public static T Deserialize<T>(string json)
        {
            return JsonConvert.DeserializeObject<T>(json, DefaultSettings);
        }
    }

    /// <summary>
    /// Custom JSON converter that rounds double values to specified decimal places
    /// </summary>
    public class RoundedDoubleConverter : JsonConverter<double>
    {
        private readonly int _decimalPlaces;

        public RoundedDoubleConverter(int decimalPlaces = 4)
        {
            _decimalPlaces = decimalPlaces;
        }

        public override double ReadJson(JsonReader reader, Type objectType, double existingValue, bool hasExistingValue, JsonSerializer serializer)
        {
            if (reader.TokenType == JsonToken.Null)
                return 0;

            if (reader.TokenType == JsonToken.Float || reader.TokenType == JsonToken.Integer)
                return Convert.ToDouble(reader.Value);

            return 0;
        }

        public override void WriteJson(JsonWriter writer, double value, JsonSerializer serializer)
        {
            // Round to specified decimal places
            double rounded = Math.Round(value, _decimalPlaces);

            // Remove trailing zeros by formatting and parsing back
            // This converts 1.5000 to 1.5
            string formatted = rounded.ToString("G", CultureInfo.InvariantCulture);

            // Write as raw value to avoid extra quotes
            writer.WriteRawValue(formatted);
        }
    }

    /// <summary>
    /// Custom JSON converter for double arrays that rounds values
    /// </summary>
    public class RoundedDoubleArrayConverter : JsonConverter<double[]>
    {
        private readonly int _decimalPlaces;

        public RoundedDoubleArrayConverter(int decimalPlaces = 4)
        {
            _decimalPlaces = decimalPlaces;
        }

        public override double[] ReadJson(JsonReader reader, Type objectType, double[] existingValue, bool hasExistingValue, JsonSerializer serializer)
        {
            return serializer.Deserialize<double[]>(reader);
        }

        public override void WriteJson(JsonWriter writer, double[] value, JsonSerializer serializer)
        {
            if (value == null)
            {
                writer.WriteNull();
                return;
            }

            writer.WriteStartArray();
            foreach (var d in value)
            {
                double rounded = Math.Round(d, _decimalPlaces);
                string formatted = rounded.ToString("G", CultureInfo.InvariantCulture);
                writer.WriteRawValue(formatted);
            }
            writer.WriteEndArray();
        }
    }
}
