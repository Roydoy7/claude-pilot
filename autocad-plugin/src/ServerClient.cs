using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// HTTP client for communicating with ClaudePilot server
    /// </summary>
    public class ServerClient
    {
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;

        public ServerClient(string baseUrl = "http://localhost:5000")
        {
            _baseUrl = baseUrl;
            _httpClient = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(30)
            };
        }

        /// <summary>
        /// Get pending commands from server
        /// </summary>
        public async Task<CommandResponse> GetPendingCommandsAsync()
        {
            try
            {
                Console.WriteLine($"[DEBUG] Sending GET request to {_baseUrl}/api/autocad/commands");
                var response = await _httpClient.GetAsync($"{_baseUrl}/api/autocad/commands");

                Console.WriteLine($"[DEBUG] Response status: {response.StatusCode}");

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[DEBUG] Response JSON: {json}");

                    var result = JsonConvert.DeserializeObject<CommandResponse>(json);
                    Console.WriteLine($"[DEBUG] Deserialized command count: {result?.Commands?.Length ?? -1}");

                    return result;
                }

                Console.WriteLine($"[DEBUG] Request failed with status: {response.StatusCode}");
                return new CommandResponse { Commands = new Command[0] };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DEBUG] Exception in GetPendingCommandsAsync: {ex.Message}");
                Console.WriteLine($"[DEBUG] Stack trace: {ex.StackTrace}");
                return new CommandResponse { Commands = new Command[0] };
            }
        }

        /// <summary>
        /// Send drawing data to server
        /// </summary>
        public async Task<bool> SendDrawingDataAsync(object drawingData)
        {
            try
            {
                var json = JsonConvert.SerializeObject(drawingData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/api/autocad/drawing-data", content);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending drawing data: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Report command execution result to server
        /// </summary>
        public async Task<bool> ReportCommandResultAsync(string commandId, CommandExecutionResult executionResult)
        {
            try
            {
                var result = new CommandResultPayload
                {
                    CommandId = commandId,
                    Success = executionResult.Success,
                    Message = executionResult.Message ?? (executionResult.Success ? "Command executed successfully" : "Command execution failed"),
                    Data = executionResult.Data,
                    IndexInfo = executionResult.IndexInfo,
                    Timestamp = DateTime.UtcNow
                };

                var json = JsonConfig.Serialize(result);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"{_baseUrl}/api/autocad/command-result", content);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting result: {ex.Message}");
                return false;
            }
        }
    }

    /// <summary>
    /// Response containing commands from server
    /// </summary>
    public class CommandResponse
    {
        public Command[] Commands { get; set; }
    }

    /// <summary>
    /// Command from server to execute in AutoCAD
    /// </summary>
    public class Command
    {
        public string Id { get; set; }
        public string Type { get; set; }
        public object Data { get; set; }
    }

    /// <summary>
    /// Payload sent back to server with command result
    /// This provides a stable structure for all command results
    /// </summary>
    public class CommandResultPayload
    {
        public string CommandId { get; set; }
        public bool Success { get; set; }
        public string Message { get; set; }
        public object Data { get; set; }
        public IndexInfo IndexInfo { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
