package fetcher

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
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
	logger.Info("creating HTTP fetcher for URL: %s", url)

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
	logger.Info("starting HTTP fetch from URL: %s", f.url)

	var lastErr error
	for attempt := 1; attempt <= httpRetryAttempts; attempt++ {
		if attempt > 1 {
			logger.Debug("retry attempt %d/%d for URL: %s", attempt, httpRetryAttempts, f.url)
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(httpRetryDelay):
			}
		}

		body, err := f.fetchAttempt(ctx)
		if err == nil {
			logger.Info("successfully fetched content (%d bytes)", len(body))
			return body, nil
		}

		lastErr = err
		logger.Error("fetch attempt %d failed: %v", attempt, err)
	}

	logger.Error("all fetch attempts failed for URL %s: %v", f.url, lastErr)
	return "", fmt.Errorf("failed to fetch content after %d attempts: %w", httpRetryAttempts, lastErr)
}

func (f *HTTPFetcher) fetchAttempt(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "KBU-Daily-Menu/1.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	logger.Debug("sending HTTP request to %s", f.url)
	resp, err := f.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logger.Error("failed to close response body: %v", closeErr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		logger.Error("received non-200 status code: %d from %s", resp.StatusCode, f.url)
		return "", fmt.Errorf("HTTP request failed with status %d", resp.StatusCode)
	}

	logger.Debug("received response with status %d, content-length: %s",
		resp.StatusCode, resp.Header.Get("Content-Length"))

	body, err := f.readResponseBody(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	logger.Debug("successfully read response body (%d bytes)", len(body))
	return body, nil
}

func (f *HTTPFetcher) readResponseBody(body io.Reader) (string, error) {
	limitedReader := io.LimitReader(body, httpMaxResponseSize)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return "", err
	}

	if len(data) == httpMaxResponseSize {
		logger.Error("response body may be truncated (reached %d bytes limit)", httpMaxResponseSize)
	}

	return string(data), nil
}
