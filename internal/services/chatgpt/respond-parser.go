package chatgpt

import (
	"encoding/json"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
)

func ParseRespond(res string) ([]*domain.MenuItem, error) {
	// if !isReponseJson(res) {
	// 	return nil, errors.New("error parsing response from AI")
	// }

	jsonString := strings.ReplaceAll(res, "\n", "")
	jsonString = strings.ReplaceAll(jsonString, "\t", "")
	jsonString = jsonString[7 : len(jsonString)-3]
	println(jsonString)

	var items []*domain.MenuItem
	err := json.Unmarshal([]byte(jsonString), &items)
	if err != nil {
		return nil, err
	}

	return items, nil
}

func isReponseJson(rep string) bool {
	return strings.HasPrefix(rep, "```json") && strings.HasSuffix(rep, "```")
}
