#include "Menu.h"
#include <iostream>
#include "FileManager.h"

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
        cout << "2. Delete File\n";
        cout << "3. Extract File\n";
        cout << "4. Exit\n";

        cout << "Enter Your Choice: ";
        cin >> choice;

        switch (choice)
        {
        case 1:
            fileManager.addFile();
            break;

        case 2:
            fileManager.deleteFile();
            break;

        case 3:
            fileManager.extractFile();
            break;

        case 4:
            cout << "Exiting AegisVault..." << endl;
            break;

        default:
            cout << "Invalid choice. Please try again." << endl;
        }

    } while (choice != 4);
}