package chatgpt

import (
	"encoding/json"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

func ParseResponse(res string) ([]*domain.MenuItem, error) {
	// if !isReponseJson(res) {
	// 	return nil, errors.New("error parsing response from AI")
	// }

	var jsonString string
	jsonString = strings.ReplaceAll(res, "\n", "")
	jsonString = strings.ReplaceAll(jsonString, "\t", "")

	logger.Debug("Trimed json string: %s", jsonString)

	var items []*domain.MenuItem
	err := json.Unmarshal([]byte(jsonString), &items)
	if err != nil {
		return nil, err
	}
	logger.Debug("Parsed menu items: %+v", items)

	return items, nil
}

func isReponseJson(rep string) bool {
	return strings.HasPrefix(rep, "```json") && strings.HasSuffix(rep, "```")
}
