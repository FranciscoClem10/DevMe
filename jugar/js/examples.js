/* Ejemplos precargados */
(function (global) {
  const EXAMPLES = {
    hola:
`Algoritmo HolaMundo
    Escribir "¡Hola, mundo!"
FinAlgoritmo`,

    promedio:
`Algoritmo Promedio
    Definir n1, n2, n3 Como Real
    Definir prom Como Real
    Escribir "Ingrese tres notas:"
    Leer n1
    Leer n2
    Leer n3
    prom <- (n1 + n2 + n3) / 3
    Escribir "El promedio es: ", prom
    Si prom >= 5 Entonces
        Escribir "Aprobado"
    Sino
        Escribir "Reprobado"
    FinSi
FinAlgoritmo`,

    factorial:
`Algoritmo Factorial
    Definir n, i, fact Como Entero
    Escribir Sin Saltar "Ingrese un número entero positivo: "
    Leer n
    fact <- 1
    Para i <- 1 Hasta n Con Paso 1 Hacer
        fact <- fact * i
    FinPara
    Escribir "El factorial de ", n, " es ", fact
FinAlgoritmo`,

    par:
`Algoritmo ParImpar
    Definir num Como Entero
    Escribir Sin Saltar "Ingrese un número: "
    Leer num
    Si num % 2 = 0 Entonces
        Escribir num, " es par"
    Sino
        Escribir num, " es impar"
    FinSi
FinAlgoritmo`,

    menu:
`Algoritmo MenuSegun
    Definir opcion Como Entero
    Escribir "Menú:"
    Escribir "1 - Saludar"
    Escribir "2 - Despedir"
    Escribir "3 - Salir"
    Escribir Sin Saltar "Elija: "
    Leer opcion
    Segun opcion Hacer
        caso 1:
            Escribir "¡Hola!"
        caso 2:
            Escribir "¡Adiós!"
        caso 3:
            Escribir "Cerrando..."
        De Otro Modo:
            Escribir "Opción no válida"
    FinSegun
FinAlgoritmo`,

    repetir:
`Algoritmo BucleRepetir
    Definir num Como Entero
    Repetir
        Escribir Sin Saltar "Ingrese un número mayor a 0: "
        Leer num
    Hasta Que num > 0
    Escribir "Ingresó: ", num
FinAlgoritmo`,

    arreglo:
`Algoritmo UsoArreglo
    Definir notas Como Real
    Dimension notas[1..5]
    Definir i Como Entero
    Definir suma Como Real
    suma <- 0
    Para i <- 1 Hasta 5 Hacer
        Escribir Sin Saltar "Nota ", i, ": "
        Leer notas[i]
        suma <- suma + notas[i]
    FinPara
    Escribir "Promedio: ", suma / 5
FinAlgoritmo`,

    matriz:
`Algoritmo Matriz
    Definir tabla Como Entero
    Dimension tabla[1..3, 1..3]
    Definir i, j Como Entero
    Para i <- 1 Hasta 3 Hacer
        Para j <- 1 Hasta 3 Hacer
            tabla[i, j] <- i * j
        FinPara
    FinPara
    Para i <- 1 Hasta 3 Hacer
        Para j <- 1 Hasta 3 Hacer
            Escribir Sin Saltar tabla[i, j], "  "
        FinPara
        Escribir ""
    FinPara
FinAlgoritmo`,

    funcion:
`Funcion cuadrado(n)
    cuadrado <- n * n
FinFuncion

Algoritmo UsoFuncion
    Definir x Como Entero
    Escribir Sin Saltar "Ingrese un número: "
    Leer x
    Escribir "El cuadrado es: ", cuadrado(x)
FinAlgoritmo`,

    referencia:
`SubProceso intercambiar(a Por Referencia, b Por Referencia)
    Definir aux Como Entero
    aux <- a
    a <- b
    b <- aux
FinSubProceso

Algoritmo Intercambio
    Definir p, q Como Entero
    p <- 10
    q <- 20
    Escribir "Antes: p=", p, " q=", q
    intercambiar(p, q)
    Escribir "Después: p=", p, " q=", q
FinAlgoritmo`,

    del1al10000:
`Algoritmo ImprimirNumeros
    //Esto es un comentario
    Definir i Como Entero
    Escribir "=== Generando serie del 1 al 10000 ==="
    Para i <- 1 Hasta 10000 Con Paso 1 Hacer
        Escribir "Número: ", i
    FinPara
    Escribir "=== Fin del Algoritmo ==="
FinAlgoritmo`,
  
 
quickSort:
`Algoritmo Quicksort
    Definir n, i Como Entero
    Escribir "Ingrese la cantidad de elementos:"
    Leer n
    Dimension arr[1..n]
    Para i <- 1 Hasta n Hacer
        Escribir Sin Saltar "Elemento ", i, ": "
        Leer arr[i]
    FinPara

    Ordenar(arr, 1, n)

    Escribir "Arreglo ordenado:"
    Para i <- 1 Hasta n Hacer
        Escribir Sin Saltar arr[i], " "
    FinPara
    Escribir ""
FinAlgoritmo

SubProceso Ordenar(arr Por Referencia, izq, der)
    Definir pivote, i, j, temp Como Entero
    Si izq < der Entonces
        pivote <- arr[izq]
        i <- izq
        j <- der
        Mientras i <= j Hacer
            Mientras arr[i] < pivote Hacer
                i <- i + 1
            FinMientras
            Mientras arr[j] > pivote Hacer
                j <- j - 1
            FinMientras
            Si i <= j Entonces
                temp <- arr[i]
                arr[i] <- arr[j]
                arr[j] <- temp
                i <- i + 1
                j <- j - 1
            FinSi
        FinMientras
        Ordenar(arr, izq, j)
        Ordenar(arr, i, der)
    FinSi
FinSubProceso`,

SiNo_Si:
`Algoritmo EjemploSiSinoSiSegun
    Definir calificacion, opcion Como Entero

    Escribir "Ingresa tu calificación:"
    Leer calificacion

    Si calificacion >= 90 Entonces
        Escribir "Excelente"
    SiNo Si calificacion >= 80 Entonces
        Escribir "Muy bien"
    SiNo Si calificacion >= 70 Entonces
        Escribir "Bien"
    SiNo Si calificacion >= 60 Entonces
        Escribir "Suficiente"
    Sino
        Escribir "Reprobado"
    FinSi

    Escribir "Selecciona una opción:"
    Escribir "1. Continuar"
    Escribir "2. Salir"
    Leer opcion

    Segun opcion Hacer
        caso 1:
            Escribir "Continuando..."
        caso 2:
            Escribir "Saliendo..."
        De Otro Modo:
            Escribir "Opción no válida."
    FinSegun
FinAlgoritmo`,

burbuja:`Algoritmo OrdenamientoBurbuja
    Definir lista, n, i, j, auxiliar Como Entero
    
    // 1. Definir el tamaño del arreglo
    n <- 6
    Dimension lista[1..n]
    
    // 2. Llenar el arreglo con datos desordenados
    lista[1] <- 45
    lista[2] <- 23
    lista[3] <- 89
    lista[4] <- 12
    lista[5] <- 5
    lista[6] <- 67
    
    Escribir "Arreglo original:"
    Para i <- 1 Hasta n Con Paso 1 Hacer
        Escribir Sin Saltar lista[i], " "
    FinPara
    Escribir "" // Salto de línea

    // 3. Aplicar el Algoritmo de Burbuja
    Para i <- 1 Hasta n - 1 Con Paso 1 Hacer
        Para j <- 1 Hasta n - i Con Paso 1 Hacer
            // Si el elemento actual es mayor que el siguiente, se intercambian
            Si lista[j] > lista[j+1] Entonces
                auxiliar <- lista[j]
                lista[j] <- lista[j+1]
                lista[j+1] <- auxiliar
            FinSi
        FinPara
    FinPara

    
    // 4. Mostrar el arreglo ordenado
    Escribir "Arreglo ordenado:"
    Para i <- 1 Hasta n Con Paso 1 Hacer
        Escribir Sin Saltar lista[i], " "
    FinPara
    Escribir "" // Salto de línea
    
FinAlgoritmo`,
	tiposDeDatos: `Algoritmo TiposDeDatos
    // ===== Definición de variables de todos los tipos =====
    Definir enteroVar Como Entero
    Definir realVar Como Real
    Definir caracterVar Como Caracter
    Definir logicoVar Como Logico
    Definir contador Como Entero
    Definir arregloEnteros Como Entero
    Dimension arregloEnteros[1..5]
    Definir i Como Entero
    
    // ===== Constantes =====
    Constante PI = 3.1416
    Constante LIMITE = 10
    
    // ===== Asignación directa (desde código) =====
    enteroVar <- 42
    realVar <- 3.14
    caracterVar <- 'A'
    logicoVar <- Verdadero
    
    // ===== Asignación por consola (lectura) =====
    Escribir "=== Ingreso de datos por consola ==="
    Escribir Sin Saltar "Ingrese un número entero: "
    Leer enteroVar
    Escribir Sin Saltar "Ingrese un número real: "
    Leer realVar
    Escribir Sin Saltar "Ingrese un carácter (entre comillas simples): "
    Leer caracterVar
    Escribir Sin Saltar "Ingrese Verdadero o Falso: "
    Leer logicoVar
    
    // ===== Mostrar valores =====
    Escribir "=== Valores almacenados ==="
    Escribir "Entero: ", enteroVar
    Escribir "Real: ", realVar
    Escribir "Caracter: ", caracterVar
    Escribir "Logico: ", logicoVar
    Escribir "PI = ", PI
    Escribir "LIMITE = ", LIMITE
    
    // ===== Arreglos =====
    Escribir "=== Llenado de arreglo ==="
    Para i <- 1 Hasta 5 Hacer
        Escribir Sin Saltar "Ingrese valor para arreglo[", i, "]: "
        Leer arregloEnteros[i]
    FinPara
    
    Escribir "=== Contenido del arreglo ==="
    Para i <- 1 Hasta 5 Hacer
        Escribir Sin Saltar arregloEnteros[i], " "
    FinPara
    Escribir ""  // salto de línea
    
    // ===== Estructura condicional (Si) =====
    Si enteroVar > 0 Entonces
        Escribir "El número entero es positivo"
    Sino
        Escribir "El número entero es negativo o cero"
    FinSi
    
    // ===== Bucle Mientras =====
    Escribir "=== Bucle Mientras ==="
    contador <- 1
    Mientras contador <= 5 Hacer
        Escribir "Contador: ", contador
        contador <- contador + 1
    FinMientras
    
    // ===== Bucle Repetir =====
    Escribir "=== Bucle Repetir ==="
    Repetir
        Escribir Sin Saltar "Ingrese un número mayor a 0: "
        Leer enteroVar
    Hasta Que enteroVar > 0
    Escribir "Número válido: ", enteroVar
    
    // ===== Bucle Para (ya usado) =====
    // ===== Estructura Según (Switch) =====
    Definir opcion Como Entero
    Escribir "=== Menú con Según ==="
    Escribir "1 - Opción A"
    Escribir "2 - Opción B"
    Escribir "3 - Salir"
    Escribir Sin Saltar "Elija: "
    Leer opcion
    Segun opcion Hacer
        caso 1:
            Escribir "Eligió Opción A"
        caso 2:
            Escribir "Eligió Opción B"
        caso 3:
            Escribir "Saliendo..."
        De Otro Modo:
            Escribir "Opción no válida"
    FinSegun
    
    // ===== Subproceso con paso por referencia =====
    // (demuestra que se puede modificar una variable desde un subproceso)
    Escribir "=== Llamada a subproceso (por referencia) ==="
    Escribir "Antes de llamar a 'duplicar': enteroVar = ", enteroVar
    duplicar(enteroVar)
    Escribir "Después de llamar a 'duplicar': enteroVar = ", enteroVar
    
FinAlgoritmo

SubProceso duplicar(n Por Referencia)
    // Duplica el valor de n (paso por referencia)
    n <- n * 2
FinSubProceso`
};
  global.EXAMPLES = EXAMPLES;
})(window);
