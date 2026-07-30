#include "Security.h"
#include <fstream>
#include <iostream>
#include <filesystem>
namespace fs = std::filesystem;
using namespace std;

bool Security::isVaultInitialized() {
	return fs::exists(vaultPath);
}

void Security::initializeVault() {
	bool createVault = fs::create_directory(vaultPath);

	if (createVault) {
		cout << "Vault created successfully.\n";
	}
	else {
		cout << "Vault already exists\n";
	}

	string fullVault = vaultPath + "/metadata.txt";

	ofstream metadataFile(fullVault);

	metadataFile.close();

	Security::createPassword();
}

void Security::createPassword() {
	string userPassword;
	string confirmPassword;

	while (true) {
		cout << "Create a master password: ";
		cin >> userPassword;

		if (!isStrongPassword(userPassword)) {
			cout << "\nPassword needs at least:\n";
			cout << "- 8 characters\n";
			cout << "- One uppercase letter\n";
			cout << "- One lowercase letter\n";
			cout << "- One digit\n";
			cout << "- One special character\n\n";
			continue;
		}

		cout << "Confirm password: ";
		cin >> confirmPassword;

		if (userPassword != confirmPassword) {
			cout << "Passwords do not match. Try again.\n\n";
			continue;
		}

		string configPath = vaultPath + "/vault.cfg";

		ofstream configFile(configPath);

		if (!configFile) {
			cout << "Error creating vault configuration file.\n";
			return;
		}

		configFile << userPassword;
		configFile.close();

		cout << "Master password created successfully!\n";
		break;
	}
}


bool Security::isStrongPassword(const string& userPassword) {
	bool hasUpper = false;
	bool hasLower = false;
	bool hasDigit = false;
	bool hasSpecial = false;

	if (userPassword.length() < 8 ){
		return false;
	}

	for (char ch : userPassword) {
		if (isupper(ch)) {
			hasUpper = true;
		}
		else if (islower(ch)) {
			hasLower = true;
		}
		else if (isdigit(ch)) {
			hasDigit = true;
		}
		else {
			hasSpecial = true;
		}
	}

	return hasUpper && hasLower && hasDigit && hasSpecial;
}

bool Security::verifyPassword() {
	string savedPassword;
	string enteredPassword;

	string configPath = vaultPath + "/vault.cfg";

	ifstream configFile(configPath);

	if (!configFile) {
		cout << "Unable to open vault configuration. \n";
		return false;
	}

	getline(configFile, savedPassword);
	configFile.close();
	cout << "Enter master Password: ";
	cin >> enteredPassword;

	if (enteredPassword == savedPassword) {
		cout << "Accessgranted.\n";
		return true;
	}
	else {
		cout << "Incorrect password! \n";
		return false;
	}
}


bool Security::login() {

	if (Security::isVaultInitialized()) {
		cout << "Existing user\n";
		return verifyPassword();
	}
	else {
		Security::initializeVault();
		return true;

	}
}