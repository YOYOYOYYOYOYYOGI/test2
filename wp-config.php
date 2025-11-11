<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'mydb' );

/** Database username */
define( 'DB_USER', 'root' );

/** Database password */
define( 'DB_PASSWORD', '' );

/** Database hostname */
define( 'DB_HOST', 'localhost' );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8mb4' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         '~p}y{@zz~10A,wmofnCeAotympyI4h<,kc6*^![0wj-KR=}_J}g^^$)46=k/L::;' );
define( 'SECURE_AUTH_KEY',  'AuQv?H]q!l6F<3~ C6sukXd~6K#qL-QHtI6J6l?B]_$r4<1m#F+uf%+}wOZQk&#,' );
define( 'LOGGED_IN_KEY',    'o.Z1u#m,rk&>XUDU/|~~hXm_+_c}{SS68S)VPxx,<dSEeY3  0nxjsf[#(wLAPLQ' );
define( 'NONCE_KEY',        'c(Tg%`f[Ch$C 0..*%k)^x|?qz@Iqf*j5R8^}YQ.yd3CHw]<n.tmB/i 9#=NE 8q' );
define( 'AUTH_SALT',        ',IKmVrxx$QqxuEW$WcWSdPd);X*[Lr1+5}#:/9(r?/@jXzS)T?(Q7mxk=_>PR7*<' );
define( 'SECURE_AUTH_SALT', 'E9*d=5d?@IR`6~T$C>q;g|| jG3oXbz4QwVWmI$r<nT,m^iDa|A= |h}N!]|26Iw' );
define( 'LOGGED_IN_SALT',   'PWcEcKX{}%i9 Ct3/YsX=,0]ALC:OTdE+ZP5+y_ll#*IO;cqB9pZNg )&ldQ3.xU' );
define( 'NONCE_SALT',       '{ezN*Z4-JOXI;pgJRIz0+~srdu?.pr.R#<tZEA%HPX:*-Z.*zPwXpf__jFk4!(?A' );

/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 *
 * At the installation time, database tables are created with the specified prefix.
 * Changing this value after WordPress is installed will make your site think
 * it has not been installed.
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/#table-prefix
 */
$table_prefix = 'wp_';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://developer.wordpress.org/advanced-administration/debug/debug-wordpress/
 */
define( 'WP_DEBUG', false );

/* Add any custom values between this line and the "stop editing" line. */



/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
