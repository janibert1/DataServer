.PHONY: build build-notray clean test

BINARY=dataserver
VERSION?=dev

build:
	go build -trimpath -ldflags="-s -w -X main.version=$(VERSION)" -o $(BINARY) .

build-notray:
	go build -tags notray -trimpath -ldflags="-s -w -X main.version=$(VERSION)" -o $(BINARY) .

clean:
	rm -f $(BINARY)

test:
	go test ./...
