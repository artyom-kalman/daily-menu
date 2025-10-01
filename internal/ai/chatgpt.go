package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type GptService struct {
	apiKey string
	url    string
	client *http.Client
}

func NewGptService(apiKey string, url string) *GptService {
	return &GptService{
		apiKey: apiKey,
		url:    url,
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:       10,
				IdleConnTimeout:    30 * time.Second,
				DisableCompression: false,
			},
		},
	}
}

func (gpt *GptService) SendRequest(ctx context.Context, messages []*Message) (any, error) {
	logger.Info("Sending request to GPT")

	reqBody := Request{
		Messages: messages,
	}

	reqBodyJson, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		"POST",
		gpt.url,
		bytes.NewBuffer(reqBodyJson),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+gpt.apiKey)

	res, err := gpt.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusCreated {
		body, err := io.ReadAll(res.Body)
		if err != nil {
			return nil, fmt.Errorf("request failed with status %d and couldn't read response", res.StatusCode)
		}
		return nil, fmt.Errorf("request failed with status %d: %s", res.StatusCode, string(body))
	}
	logger.Info("Successfully sent request to GPT: %d", res.StatusCode)

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var response Response
	err = json.Unmarshal(body, &response)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}
	logger.Debug("GPT response: %+v", response)

	if !response.Success {
		return nil, fmt.Errorf("AI request failed: %v", response.Errors)
	}

	logger.Info("Successfully received response from GPT")
	return response.Result.Response, nil
}
