package http

import (
	"log"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/application/rest"
)

const API_ROUTE = "/api"

func Run() {
	SetupRouts()
	StartServer()
}

func SetupRouts() {
	fs := http.FileServer(http.Dir("./public/"))
	http.Handle("/public/", http.StripPrefix("/public/", fs))

	http.HandleFunc("/", rest.GetIndex)
}

func StartServer() {
	log.Print("Server is running on localhost:3000")
	err := http.ListenAndServe(":3000", nil)
	if err != nil {
		panic(err)
	}
}
