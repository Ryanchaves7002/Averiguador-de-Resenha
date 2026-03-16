#include <stdio.h>
#include <string.h>

int analisar(char texto[]){

int score = 0;

if(strstr(texto,"resenha")) score += 20;
if(strstr(texto,"churrasco")) score += 20;
if(strstr(texto,"cerveja")) score += 20;

return score;
}

int main(){

char texto[200];

printf("Digite mensagem: ");
fgets(texto,200,stdin);

int resultado = analisar(texto);

printf("Probabilidade: %d%%\n", resultado);

return 0;
}