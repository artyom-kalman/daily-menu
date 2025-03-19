package chatgpt

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type GptService struct {
	apiKey string
	url    string
}

func NewChatGPTService(apiKey string, url string) *GptService {
	return &GptService{
		apiKey: apiKey,
		url:    url,
	}
}

func (gpt *GptService) SendRequest(messages []*Message) ([]*domain.MenuItem, error) {
	logger.Info("Sending request to GPT")

	reqBody := Request{
		Messages: messages,
	}
	logger.Debug("Request body: %+v", reqBody)

	reqBodyJson, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(
		"POST",
		gpt.url,
		bytes.NewBuffer(reqBodyJson),
	)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+gpt.apiKey)

	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != 200 && res.StatusCode != 201 {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("Bad request to AI: %s", body)
	}
	logger.Info("Successfuly sent request to GTP: %d", res.StatusCode)

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var response Response
	err = json.Unmarshal(body, &response)
	if err != nil {
		return nil, err
	}
	logger.Debug("GPT response: %+v", response)

	if !response.Success {
		return nil, fmt.Errorf("failed to get menu description")
	}

	logger.Info("Successfully received response from GPT")
	return ParseResponse(response.Result.Response)
}
