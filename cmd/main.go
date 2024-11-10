package main

import (
	"log"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/api/rest"
	"github.com/artyom-kalman/kbu-daily-menu/api/telegram"
	"github.com/artyom-kalman/kbu-daily-menu/config"
)

const WEB_APP_PORT = ":3000"

func main() {
	databasePath := "data/daily-menu.db"
	peonyUrl := "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=4"
	azileanUrl := "https://kbu.ac.kr/kor/CMS/DietMenuMgr/list.do?mCode=MN203&searchDietCategory=5"

	config.InitApp(databasePath, peonyUrl, azileanUrl)

	telegram.RunBot()

	rest.SetupRouts()

	log.Println("Server is running on ", WEB_APP_PORT)
	err := http.ListenAndServe(WEB_APP_PORT, nil)
	if err != nil {
		log.Fatal(err)
	}
}
