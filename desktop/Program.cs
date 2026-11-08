using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shell;
using Microsoft.Web.WebView2.Wpf;

namespace VibeMapDesktop
{
    public class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                string targetRoot = args.Length > 0 ? args[0] : null;
                bool createdNew;
                using var mutex = new Mutex(true, "Local\\VibeMapDesktopSingletonMutexV2", out createdNew);

                if (!createdNew)
                {
                    Task.Run(async () =>
                    {
                        try
                        {
                            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                            string json = targetRoot != null
                                ? "{\"type\":\"window-open\",\"projectRoot\":\"" + targetRoot.Replace("\\", "\\\\") + "\"}"
                                : "{\"type\":\"window-open\"}";
                            await client.PostAsync("http://127.0.0.1:19527/api/notify", new StringContent(json, Encoding.UTF8, "application/json"));
                        }
                        catch { }
                    }).Wait(1200);
                    return;
                }

                var app = new System.Windows.Application();
                app.DispatcherUnhandledException += (s, e) =>
                {
                    File.WriteAllText(@"E:\Inriel_Project\LLM_sandbox\VibeMap\crash.log", e.Exception.ToString());
                };
                var win = new MainWindow(targetRoot);
                app.Run(win);
            }
            catch (Exception ex)
            {
                File.WriteAllText(@"E:\Inriel_Project\LLM_sandbox\VibeMap\crash.log", ex.ToString());
            }
        }
    }

    public class MainWindow : Window
    {
        private readonly string _initialProjectRoot;
        private WebView2 _webView;
        private Button _btnPin;

        public MainWindow(string initialProjectRoot)
        {
            _initialProjectRoot = initialProjectRoot;
            Title = "VibeMap";
            Width = 1080;
            Height = 700;
            MinWidth = 640;
            MinHeight = 420;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = false;
            Background = new SolidColorBrush(Color.FromRgb(245, 244, 239));
            Topmost = true;

            var chrome = new WindowChrome
            {
                CaptionHeight = 0,
                ResizeBorderThickness = new Thickness(6),
                GlassFrameThickness = new Thickness(0),
                CornerRadius = new CornerRadius(0)
            };
            WindowChrome.SetWindowChrome(this, chrome);

            BuildLayout();
            Loaded += OnWindowLoaded;
        }

        private void BuildLayout()
        {
            var outerBorder = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(245, 244, 239)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(212, 209, 200)),
                BorderThickness = new Thickness(1)
            };

            var grid = new Grid();
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(36) });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            // Row 0: Native Draggable Header Bar (Seamless with Canvas)
            var titleBar = new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(245, 244, 239)),
                BorderBrush = new SolidColorBrush(Color.FromRgb(228, 225, 217)),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(14, 0, 8, 0),
                Cursor = Cursors.SizeAll
            };

            titleBar.MouseLeftButtonDown += (s, e) =>
            {
                if (e.ClickCount == 2)
                {
                    WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                }
                else
                {
                    DragMove();
                }
            };

            var headerGrid = new Grid();
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var brandText = new TextBlock
            {
                Text = "VibeMap",
                Foreground = new SolidColorBrush(Color.FromRgb(90, 88, 82)),
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(brandText, 0);
            headerGrid.Children.Add(brandText);

            var rightControls = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            _btnPin = CreateWindowButton("已置顶", true);
            _btnPin.Click += (s, e) =>
            {
                Topmost = !Topmost;
                _btnPin.Content = Topmost ? "已置顶" : "置顶";
                _btnPin.Foreground = new SolidColorBrush(Topmost
                    ? Color.FromRgb(37, 99, 235)
                    : Color.FromRgb(120, 117, 110));
            };

            var btnMin = CreateWindowButton("—", false);
            btnMin.Width = 30;
            btnMin.Click += (s, e) => WindowState = WindowState.Minimized;

            var btnMax = CreateWindowButton("□", false);
            btnMax.Width = 30;
            btnMax.Click += (s, e) =>
            {
                WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
            };

            var btnClose = CreateWindowButton("✕", false);
            btnClose.Width = 30;
            btnClose.Click += (s, e) => Close();

            rightControls.Children.Add(_btnPin);
            rightControls.Children.Add(btnMin);
            rightControls.Children.Add(btnMax);
            rightControls.Children.Add(btnClose);

            Grid.SetColumn(rightControls, 1);
            headerGrid.Children.Add(rightControls);
            titleBar.Child = headerGrid;

            Grid.SetRow(titleBar, 0);
            grid.Children.Add(titleBar);

            // Row 1: WebView2 Canvas
            _webView = new WebView2
            {
                DefaultBackgroundColor = System.Drawing.Color.FromArgb(245, 244, 239)
            };
            Grid.SetRow(_webView, 1);
            grid.Children.Add(_webView);

            outerBorder.Child = grid;
            Content = outerBorder;
        }

        private Button CreateWindowButton(string text, bool active)
        {
            return new Button
            {
                Content = text,
                Height = 26,
                Padding = new Thickness(8, 0, 8, 0),
                Margin = new Thickness(2, 0, 2, 0),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Foreground = new SolidColorBrush(active
                    ? Color.FromRgb(37, 99, 235)
                    : Color.FromRgb(120, 117, 110)),
                FontSize = 11.5,
                FontWeight = FontWeights.Medium,
                Cursor = Cursors.Hand
            };
        }

        private async void OnWindowLoaded(object sender, RoutedEventArgs e)
        {
            await EnsureLocalServerAsync();
            string userDataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "VibeMap",
                "WebView2Data"
            );
            var env = await Microsoft.Web.WebView2.Core.CoreWebView2Environment.CreateAsync(null, userDataDir);
            await _webView.EnsureCoreWebView2Async(env);
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.WebMessageReceived += (s, args) =>
            {
                var msg = args.TryGetWebMessageAsString();
                if (msg == "popup-window")
                {
                    Dispatcher.Invoke(() =>
                    {
                        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
                        Activate();
                        Focus();
                    });
                }
            };

            string url = "http://127.0.0.1:19527";
            if (!string.IsNullOrWhiteSpace(_initialProjectRoot))
            {
                url += "?projectRoot=" + Uri.EscapeDataString(_initialProjectRoot);
            }
            _webView.Source = new Uri(url);
        }

        private async Task EnsureLocalServerAsync()
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) };
            try
            {
                var res = await client.GetAsync("http://127.0.0.1:19527/api/ping");
                if (res.IsSuccessStatusCode) return;
            }
            catch { }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.GetFullPath(Path.Combine(baseDir, "src", "server.js"));
            if (!File.Exists(serverScript))
            {
                serverScript = @"E:\Inriel_Project\LLM_sandbox\VibeMap\src\server.js";
            }

            var psi = new ProcessStartInfo
            {
                FileName = "node",
                Arguments = $"\"{serverScript}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            try
            {
                Process.Start(psi);
            }
            catch { }

            for (int i = 0; i < 15; i++)
            {
                await Task.Delay(150);
                try
                {
                    var res = await client.GetAsync("http://127.0.0.1:19527/api/ping");
                    if (res.IsSuccessStatusCode) return;
                }
                catch { }
            }
        }
    }
}
