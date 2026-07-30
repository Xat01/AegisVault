#pragma once
#include <string>
class Security {
public:
	bool login();
	bool isVaultInitialized();
private:
	
	void initializeVault();
	void createPassword();
	bool verifyPassword();
	bool isStrongPassword(const std::string& password);
	const std::string vaultPath = "Vault";
};