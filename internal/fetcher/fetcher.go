package fetcher

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menudescription"
	"github.com/artyom-kalman/kbu-daily-menu/internal/services/menuparser"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

const (
	defaultTimeout   = 30 * time.Second
	maxResponseSize  = 10 * 1024 * 1024
	emptyMenuMessage = "Сегодня тут пусто"
	retryAttempts    = 3
	retryDelay       = 2 * time.Second
)

type MenuFetcher struct {
	url        string
	menuDesc   *menudescription.MenuDescriptionService
	httpClient *http.Client
}

func New(url string, ds *menudescription.MenuDescriptionService) *MenuFetcher {
	logger.Info("creating menu fetcher for URL: %s", url)

	client := &http.Client{
		Timeout: defaultTimeout,
		Transport: &http.Transport{
			MaxIdleConns:       10,
			IdleConnTimeout:    30 * time.Second,
			DisableCompression: false,
		},
	}

	return &MenuFetcher{
		url:        url,
		menuDesc:   ds,
		httpClient: client,
	}
}

func (f *MenuFetcher) FetchMenu() (*domain.Menu, error) {
	return f.FetchMenuWithContext(context.Background())
}

func (f *MenuFetcher) FetchMenuWithContext(ctx context.Context) (*domain.Menu, error) {
	logger.Info("starting menu fetch from URL: %s", f.url)

	var lastErr error
	for attempt := 1; attempt <= retryAttempts; attempt++ {
		if attempt > 1 {
			logger.Debug("retry attempt %d/%d for URL: %s", attempt, retryAttempts, f.url)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(retryDelay):
			}
		}

		menu, err := f.fetchMenuAttempt(ctx)
		if err == nil {
			logger.Info("successfully fetched menu with %d items", len(menu.Items))
			return menu, nil
		}

		lastErr = err
		logger.Error("fetch attempt %d failed: %v", attempt, err)
	}

	logger.Error("all fetch attempts failed for URL %s: %v", f.url, lastErr)
	return nil, fmt.Errorf("failed to fetch menu after %d attempts: %w", retryAttempts, lastErr)
}

func (f *MenuFetcher) fetchMenuAttempt(ctx context.Context) (*domain.Menu, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "KBU-Daily-Menu/1.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	logger.Debug("sending HTTP request to %s", f.url)
	resp, err := f.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logger.Error("failed to close response body: %v", closeErr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		logger.Error("received non-200 status code: %d from %s", resp.StatusCode, f.url)
		return nil, fmt.Errorf("HTTP request failed with status %d", resp.StatusCode)
	}

	logger.Debug("received response with status %d, content-length: %s",
		resp.StatusCode, resp.Header.Get("Content-Length"))

	body, err := f.readResponseBody(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	logger.Debug("successfully read response body (%d bytes)", len(body))

	dishes, err := menuparser.ParseBody(string(body))
	if err != nil {
		logger.Error("failed to parse menu from response body: %v", err)
		return nil, fmt.Errorf("menu parsing failed: %w", err)
	}

	logger.Debug("parsed %d dishes from response", len(dishes))

	now := time.Now()
	menu := domain.NewMenuFromDishes(dishes, &now)

	if len(menu.Items) == 0 {
		logger.Info("no menu items found, creating empty menu placeholder")
		menu.Items = append(menu.Items, &domain.MenuItem{
			Name: emptyMenuMessage,
		})
		return menu, nil
	}

	logger.Debug("adding descriptions to %d menu items", len(menu.Items))
	if err := f.menuDesc.AddDescriptionToMenu(menu); err != nil {
		logger.Error("failed to add descriptions to menu: %v", err)
		return nil, fmt.Errorf("failed to add menu descriptions: %w", err)
	}

	logger.Info("successfully processed menu with %d items", len(menu.Items))
	return menu, nil
}

func (f *MenuFetcher) readResponseBody(body io.Reader) ([]byte, error) {
	limitedReader := io.LimitReader(body, maxResponseSize)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, err
	}

	if len(data) == maxResponseSize {
		logger.Error("response body may be truncated (reached %d bytes limit)", maxResponseSize)
	}

	return data, nil
}
