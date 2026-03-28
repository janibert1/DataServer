package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/zalando/go-keyring"

	"github.com/jan/dataserver-desktop/internal/api"
	"github.com/jan/dataserver-desktop/internal/config"
)

const (
	keyringService = "dataserver-desktop"
	keyringUser    = "api-token"
)

func GenerateDeviceCode() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func DeviceAuthURL(serverURL, code string) string {
	return fmt.Sprintf("%s/device-auth?code=%s", serverURL, code)
}

func PollForToken(client *api.Client, code string, timeout time.Duration) (*api.DevicePollResponse, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := client.PollDeviceAuth(code)
		if err != nil {
			log.Warn().Err(err).Msg("Poll failed, retrying...")
			time.Sleep(3 * time.Second)
			continue
		}

		if resp.Status == "complete" {
			return resp, nil
		}

		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("device auth timed out after %v", timeout)
}

func SaveToken(token string) error {
	return keyring.Set(keyringService, keyringUser, token)
}

func LoadToken() (string, error) {
	token, err := keyring.Get(keyringService, keyringUser)
	if err != nil {
		return "", err
	}
	return token, nil
}

func DeleteToken() error {
	return keyring.Delete(keyringService, keyringUser)
}

func IsLoggedIn() bool {
	cfg := config.Get()
	if cfg.ServerURL == "" {
		return false
	}
	token, err := LoadToken()
	return err == nil && token != ""
}
