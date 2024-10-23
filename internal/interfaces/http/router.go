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

	// http.HandleFunc(API_ROUTE+"/peony", rest.GetPeonyHandler)
	// http.HandleFunc(API_ROUTE+"/azilea", rest.GetAzileaHandler)
}

func StartServer() {
	log.Print("Server is running on localhost:8000")
	err := http.ListenAndServe("localhost:8000", nil)
	if err != nil {
		panic(err)
	}
}
