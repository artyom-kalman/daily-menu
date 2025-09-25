package menu

import (
	"encoding/json"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type JSONParser struct{}

func NewJSONParser() *JSONParser {
	return &JSONParser{}
}

func (p *JSONParser) ParseMenuItems(response string) ([]*MenuItem, error) {
	jsonString := p.cleanJSONResponse(response)

	var items []*MenuItem
	err := json.Unmarshal([]byte(jsonString), &items)
	if err != nil {
		return nil, err
	}

	logger.Debug("parsed %d menu items from JSON", len(items))
	return items, nil
}

func (p *JSONParser) cleanJSONResponse(response string) string {
	jsonString := strings.ReplaceAll(response, "\n", "")
	jsonString = strings.ReplaceAll(jsonString, "\t", "")
	return jsonString
}
