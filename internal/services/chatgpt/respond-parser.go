package chatgpt

import (
	"encoding/json"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

func ParseResponse(res string) ([]*domain.MenuItem, error) {
	var jsonString string
	jsonString = strings.ReplaceAll(res, "\n", "")
	jsonString = strings.ReplaceAll(jsonString, "\t", "")

	var items []*domain.MenuItem
	err := json.Unmarshal([]byte(jsonString), &items)
	if err != nil {
		return nil, err
	}
	logger.Debug("Parsed menu items: %+v", items)

	return items, nil
}
