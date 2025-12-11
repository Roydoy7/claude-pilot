using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.AutoCAD.ApplicationServices;

namespace ClaudePilot.AutoCAD
{
    /// <summary>
    /// Pending command with its data
    /// </summary>
    internal class PendingCommand
    {
        public Command Command { get; set; }
        public TaskCompletionSource<CommandExecutionResult> ResultSource { get; set; }
    }

    /// <summary>
    /// Polls server for commands and executes them
    /// Uses Application.Idle event to execute commands on the main thread
    /// Always uses MdiActiveDocument to support document switching
    /// </summary>
    public class CommandPoller
    {
        private readonly ServerClient _client;
        private Timer _pollTimer;
        private bool _isRunning;
        private readonly int _pollIntervalMs;

        // Queue for commands that need to be executed on the main thread
        private readonly ConcurrentQueue<PendingCommand> _pendingCommands = new ConcurrentQueue<PendingCommand>();
        private bool _idleHandlerRegistered = false;

        public bool IsRunning => _isRunning;

        /// <summary>
        /// Get current active document (may change during runtime)
        /// </summary>
        private Document ActiveDocument => Application.DocumentManager.MdiActiveDocument;

        public CommandPoller(string serverUrl = "http://localhost:5000", int pollIntervalMs = 2000)
        {
            _client = new ServerClient(serverUrl);
            _pollIntervalMs = pollIntervalMs;
            _isRunning = false;
        }

        /// <summary>
        /// Start polling for commands
        /// </summary>
        public void Start()
        {
            if (_isRunning)
            {
                var doc = ActiveDocument;
                doc?.Editor.WriteMessage("\nCommand poller is already running");
                return;
            }

            _isRunning = true;

            // Register Idle handler to process commands on main thread
            if (!_idleHandlerRegistered)
            {
                Application.Idle += OnApplicationIdle;
                _idleHandlerRegistered = true;
            }

            _pollTimer = new Timer(async _ => await PollAndExecute(), null, 0, _pollIntervalMs);

            var activeDoc = ActiveDocument;
            activeDoc?.Editor.WriteMessage($"\nStarted polling server every {_pollIntervalMs}ms");
        }

        /// <summary>
        /// Stop polling for commands
        /// </summary>
        public void Stop()
        {
            if (!_isRunning)
            {
                var doc = ActiveDocument;
                doc?.Editor.WriteMessage("\nCommand poller is not running");
                return;
            }

            _isRunning = false;
            _pollTimer?.Dispose();
            _pollTimer = null;

            // Unregister Idle handler
            if (_idleHandlerRegistered)
            {
                Application.Idle -= OnApplicationIdle;
                _idleHandlerRegistered = false;
            }

            var activeDoc = ActiveDocument;
            activeDoc?.Editor.WriteMessage("\nStopped polling server");
        }

        /// <summary>
        /// Handle Application.Idle event - execute commands on main thread
        /// </summary>
        private void OnApplicationIdle(object sender, EventArgs e)
        {
            // Process all pending commands
            while (_pendingCommands.TryDequeue(out var pending))
            {
                try
                {
                    // Get current active document at execution time
                    Document doc = ActiveDocument;
                    if (doc == null)
                    {
                        pending.ResultSource.TrySetResult(
                            new CommandExecutionResult(false, "No active document")
                        );
                        continue;
                    }

                    // Create executor for current document and execute command
                    CommandExecutionResult result;
                    using (doc.LockDocument())
                    {
                        var executor = new CommandExecutor(doc);
                        result = executor.ExecuteCommand(pending.Command);
                    }
                    pending.ResultSource.TrySetResult(result);
                }
                catch (Exception ex)
                {
                    pending.ResultSource.TrySetResult(
                        new CommandExecutionResult(false, $"Error executing command: {ex.Message}")
                    );
                }
            }
        }

        /// <summary>
        /// Poll server and queue commands for execution
        /// </summary>
        private async Task PollAndExecute()
        {
            if (!_isRunning)
                return;

            try
            {
                var response = await _client.GetPendingCommandsAsync();

                if (response.Commands != null && response.Commands.Length > 0)
                {
                    foreach (var command in response.Commands)
                    {
                        // Queue command for execution on main thread
                        var pending = new PendingCommand
                        {
                            Command = command,
                            ResultSource = new TaskCompletionSource<CommandExecutionResult>()
                        };

                        _pendingCommands.Enqueue(pending);

                        // Wait for result from main thread execution
                        var result = await pending.ResultSource.Task;

                        // Report result back to server
                        await _client.ReportCommandResultAsync(command.Id, result);
                    }
                }
            }
            catch
            {
                // Log error silently - don't spam the command line
            }
        }
    }
}
