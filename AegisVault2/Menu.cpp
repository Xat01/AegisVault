#include "Menu.h"
#include <iostream>
#include "FileManager.h"
#include "Encryption.h"

using namespace std;

void Menu::showMenu()
{
    FileManager fileManager;
    int choice;

    do
    {
        cout << "\n========================================\n";
        cout << "              AEGISVAULT\n";
        cout << "========================================\n";

        cout << "1. Add File\n";
        cout << "2. View File\n";
        cout << "3. Delete File\n";
        cout << "4. Extract File\n";
        cout << "5. Encrypt File\n";
        cout << "6. Exit\n";

        cout << "Enter Your Choice: ";
        cin >> choice;

        switch (choice)
        {
        case 1:
            fileManager.addFile();
            break;

        case 2:
            fileManager.listFile();
            break;

        case 3:
            fileManager.deleteFile();
            break;

        case 4:
            fileManager.extractFile();
            break;

        case 5:
        {
            Encryption env;

            bool success = env.encryptFile(
                "C:\\Users\\sa595\\Desktop\\hello.txt",
                "C:\\Users\\sa595\\Desktop\\hello.env",
                "Dracula123"
            );

            if (success) {
                cout << "Encryption Successful!\n";
            }
            else {
                cout << "Encryption Failed!\n";
            }
            break;
        }


        case 6:
            cout << "Exiting AegisVault..." << endl;
            break;

        default:
            cout << "Invalid choice. Please try again." << endl;
        }
    } while (choice != 5);
}