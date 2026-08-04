#include "Security.h"
#include <fstream>
#include <iostream>
#include <filesystem>
#include <sstream>
#include <functional>
#include <string>
namespace fs = std::filesystem;
using namespace std;

bool Security::isVaultInitialized() {


	if (!fs::exists(vaultPath)) {
		return false;
	}
	if (!fs::exists(configPath)) {
		return false;
	}
	return true;
}
	

void Security::initializeVault() {
	bool createVault = fs::create_directory(vaultPath);


	if (createVault) {
		cout << "Vault created successfully.\n";
	}
	else {
		cout << "Vault already exists\n";
	}

	bool createFiles = fs::create_directory(filesPath);

	if (createFiles) {
		cout << "Files folder created successfully.\n";
	}
	else {
		cout << "Files folder already exists\n";
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

		string hashPass = Security::hashPassword(userPassword);
		


		string configPath = vaultPath + "/vault.cfg";

		ofstream configFile(configPath);

		if (!configFile) {
			cout << "Error creating vault configuration file.\n";
			return;
		}

		configFile << hashPass;
		cout << "Password Hashed successfully. \n";
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

	string verHashPass = Security::hashPassword(enteredPassword);

	if (verHashPass == savedPassword) {
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

string Security::hashPassword(const string& password) {
	hash<string> hasher;

	size_t hashedValue = hasher(password);

	ostringstream stream;
	stream << hex << hashedValue; // converts the numericals into hexadecimals.

	return stream.str();

}

void Security::destroyVault() {
	if (!fs::exists(vaultPath)) {
		cout << "Cannot destroy Vault does not exists\n";
		return;
	}

	if (!verifyPassword()) {
		cout << "Access denied\n";
		return;
	}
	string delPhrase;
	cout << "------ WARNING ------\n";
	cout << "ABOUT TO DELETE THE VAULT AND ITS FOLDERS\n";
	cout << "Enter DELETE or D to delete! : ";
	cin >> delPhrase;

	if (delPhrase == "DELETE" || delPhrase == "D") {
		fs::remove_all(vaultPath);
		cout << "Vault destroyed successfully.\n";
		return;
	}

}
