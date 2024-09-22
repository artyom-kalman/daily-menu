package main

import (
	"log"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/api"
)

const API_ROUTE = "/api"

func main() {
	http.HandleFunc("/", api.GetIndex)

	http.HandleFunc(API_ROUTE+"/peony", api.GetPeonyHandler)
	http.HandleFunc(API_ROUTE+"/azilea", api.GetAzileaHandler)

	log.Print("Server is running on localhost:8000")
	err := http.ListenAndServe("localhost:8000", nil)
	if err != nil {
		log.Fatal(err)
	}

}
