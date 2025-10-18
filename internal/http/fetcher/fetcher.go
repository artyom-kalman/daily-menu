package fetcher

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

const (
	httpDefaultTimeout  = 30 * time.Second
	httpMaxResponseSize = 10 * 1024 * 1024
	httpRetryAttempts   = 3
	httpRetryDelay      = 2 * time.Second
)

type HTTPFetcher struct {
	url        string
	httpClient *http.Client
}

func NewHTTPFetcher(url string) *HTTPFetcher {
	client := &http.Client{
		Timeout: httpDefaultTimeout,
		Transport: &http.Transport{
			MaxIdleConns:       10,
			IdleConnTimeout:    30 * time.Second,
			DisableCompression: false,
		},
	}

	return &HTTPFetcher{
		url:        url,
		httpClient: client,
	}
}

func (f *HTTPFetcher) Fetch() (string, error) {
	return f.FetchWithContext(context.Background())
}

func (f *HTTPFetcher) FetchWithContext(ctx context.Context) (string, error) {
	var lastErr error
	for attempt := 1; attempt <= httpRetryAttempts; attempt++ {
		if attempt > 1 {
			slog.Warn("Retry attempt for URL",
				"attempt", attempt,
				"max_attempts", httpRetryAttempts,
				"url", f.url)
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(httpRetryDelay):
			}
		}

		body, err := f.fetchAttempt(ctx)
		if err == nil {
			slog.Debug("Successfully fetched content",
				"bytes", len(body))
			return body, nil
		}

		lastErr = err
		slog.Error("Fetch attempt failed",
			"error", err,
			"attempt", attempt)
	}

	slog.Error("All fetch attempts failed for URL",
		"error", lastErr,
		"url", f.url)
	return "", fmt.Errorf("failed to fetch content after %d attempts: %w", httpRetryAttempts, lastErr)
}

func (f *HTTPFetcher) fetchAttempt(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "KBU-Daily-Menu/1.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			slog.Error("Failed to close response body", "error", closeErr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		slog.Error("Received non-200 status code",
			"status_code", resp.StatusCode,
			"url", f.url)
		return "", fmt.Errorf("HTTP request failed with status %d", resp.StatusCode)
	}

	body, err := f.readResponseBody(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	return body, nil
}

func (f *HTTPFetcher) readResponseBody(body io.Reader) (string, error) {
	limitedReader := io.LimitReader(body, httpMaxResponseSize)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return "", err
	}

	if len(data) == httpMaxResponseSize {
		slog.Warn("Response body may be truncated",
			"max_bytes", httpMaxResponseSize)
	}

	return string(data), nil
}
