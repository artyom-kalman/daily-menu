package tests

import (
	"testing"

	"github.com/artyom-kalman/kbu-daily-menu/internal/services/chatgpt"
)

func TestParseResponse(t *testing.T) {
	gptMessage := `
	***json[
    {
        "name": "Томатные спагетти",
        "description": "Классическое итальянское блюдо из пасты с томатным соусом, часто с добавлением чеснока и базилика.",
        "spiciness": 1
    },
	{
	    "name": "Куриные наггетсы",
	    "description": "Жареные кусочки куриного филе в хрустящей корочке, часто подаются с соусами.",
	    "spiciness": 1
	},
	{
	    "name": "Рис с хлореллой",
	    "description": "Питательное блюдо из риса с добавлением хлореллы, богатой белками и витаминами.",
	    "spiciness": 1
	},
	{
	    "name": "Острая редька в бульоне",
	    "description": "Суп с редькой, приправленный специями и острыми ингредиентами для придания вкуса.",
	    "spiciness": 3
	},
	{
	    "name": "Кorean style овощные пельмени",
	    "description": "Пельмени, фаршированные смесью различных овощей, подаются с соусом.",
	    "spiciness": 2
	},
	{
	    "name": "Салат из капусты",
	    "description": "Легкий салат, составленный из свежей капусты, приправленный легкой заправкой.",
	    "spiciness": 1
	},
	{
	    "name": "Кимчи",
	    "description": "Традиционная корейская закуска из ферментированных овощей, часто острая.",
	    "spiciness": 4
	},
	{
	    "name": "Йогурт",
	    "description": "Кисломолочный продукт, обычно подаваемый как десерт или закуска, бывает натуральным и с добавками.",
	    "spiciness": 1
	}
	]
	***`

	result, err := chatgpt.ParseRespond(gptMessage)
	if err != nil {
		panic(err)
	}
	println(result[0].Description)
}
