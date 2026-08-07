#include "Menu.h"
#include <ctime>
#include <cstdlib>
#include "Security.h"
#include <iostream>

int main() {

	Security sec;
	if (sec.login()){
		srand(time(nullptr));
		Menu menu;
		menu.showMenu();
	}

	return 0;
}