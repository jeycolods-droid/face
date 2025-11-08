# Usa una imagen base con PHP y Apache (o FPM)
FROM php:8.2-apache 

# Instala las librerías de PostgreSQL y el driver PHP (pdo_pgsql)
# Esto resuelve el error de conexión a la base de datos
RUN apt-get update && \
    apt-get install -y libpq-dev && \
    docker-php-ext-install pdo pdo_pgsql

# Copia todo el código de tu proyecto al directorio del servidor web
COPY . /var/www/html

# Configurar permisos
RUN chown -R www-data:www-data /var/www/html

# Puerto de escucha
EXPOSE 80