package main

import (
	"log"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/api"
	"github.com/artyom-kalman/kbu-daily-menu/service"
)

const API_ROUTE = "/api"

func main() {
	fs := http.FileServer(http.Dir("./public"))
	http.Handle("/", fs)

	// http.HandleFunc("/", api.GetIndex)

	http.HandleFunc(API_ROUTE+"/peony", api.GetPeonyHandler)
	http.HandleFunc(API_ROUTE+"/azilea", api.GetAzileaHandler)

	service.GetPeonyMenu()
	log.Print("Server is running on localhost:8000")
	err := http.ListenAndServe("localhost:8000", nil)
	if err != nil {
		log.Fatal(err)
	}

}
