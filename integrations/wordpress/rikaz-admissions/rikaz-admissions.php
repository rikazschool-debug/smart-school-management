<?php
/**
 * Plugin Name: ركاز — مزامنة طلبات التسجيل
 * Description: يرسل طلبات التسجيل المحفوظة (almalki_registration) إلى قسم «القبول والتسجيل» في ركاز بتوقيع سري، مع قائمة انتظار وإعادة محاولة ومنع التكرار. لا يغيّر النموذج أو البريد أو فتح واتساب.
 * Version: 1.0.0
 * Requires at least: 5.6
 * Requires PHP: 7.4
 * Text Domain: rikaz-admissions
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'RIKAZ_ADM_OPT', 'rikaz_adm_settings' );
define( 'RIKAZ_ADM_PT', 'almalki_registration' );
define( 'RIKAZ_ADM_CRON', 'rikaz_adm_process_queue' );
define( 'RIKAZ_ADM_MAX', 12 );

/* ---------- settings ---------- */
function rikaz_adm_settings() {
	$s = get_option( RIKAZ_ADM_OPT, array() );
	return wp_parse_args( is_array( $s ) ? $s : array(), array( 'endpoint' => '', 'source' => '', 'secret' => '', 'activated_at' => 0, 'year' => '' ) );
}

register_activation_hook( __FILE__, function () {
	$s = rikaz_adm_settings();
	// Historical posts are never sent automatically: only posts created after activation enter the queue.
	if ( empty( $s['activated_at'] ) ) { $s['activated_at'] = time(); }
	update_option( RIKAZ_ADM_OPT, $s, false );
	if ( ! wp_next_scheduled( RIKAZ_ADM_CRON ) ) { wp_schedule_event( time() + 60, 'rikaz_five_min', RIKAZ_ADM_CRON ); }
} );
register_deactivation_hook( __FILE__, function () { wp_clear_scheduled_hook( RIKAZ_ADM_CRON ); } );

add_filter( 'cron_schedules', function ( $s ) {
	$s['rikaz_five_min'] = array( 'interval' => 300, 'display' => 'كل 5 دقائق (ركاز)' );
	return $s;
} );

/* ---------- queue ---------- */
// wp_after_insert_post runs after meta_input is fully saved (unlike save_post), so all reg_* fields exist.
add_action( 'wp_after_insert_post', function ( $post_id, $post, $update ) {
	if ( $update || ! $post || $post->post_type !== RIKAZ_ADM_PT || $post->post_status !== 'publish' ) { return; }
	$s = rikaz_adm_settings();
	if ( empty( $s['activated_at'] ) || strtotime( $post->post_date_gmt . ' UTC' ) < (int) $s['activated_at'] - 5 ) { return; }
	rikaz_adm_enqueue( $post_id );
	// Try once at the end of this request without delaying the visitor's WhatsApp redirect noticeably.
	add_action( 'shutdown', function () use ( $post_id ) { rikaz_adm_send( $post_id ); } );
}, 20, 3 );

function rikaz_adm_enqueue( $post_id ) {
	if ( get_post_meta( $post_id, '_rikaz_status', true ) === 'success' ) { return; }
	update_post_meta( $post_id, '_rikaz_status', 'pending' );
	if ( get_post_meta( $post_id, '_rikaz_attempts', true ) === '' ) { update_post_meta( $post_id, '_rikaz_attempts', 0 ); }
	update_post_meta( $post_id, '_rikaz_next', time() );
}

function rikaz_adm_payload( $post_id ) {
	$m = function ( $k ) use ( $post_id ) { return (string) get_post_meta( $post_id, $k, true ); };
	$date = $m( 'reg_date' );
	// reg_ip is deliberately not sent.
	return array(
		'wp_id'        => (int) $post_id,
		'student_name' => $m( 'reg_student_name' ),
		'parent_name'  => $m( 'reg_parent_name' ),
		'phone'        => $m( 'reg_phone' ),
		'grade'        => $m( 'reg_grade' ),
		'school'       => $m( 'reg_school' ),
		'email'        => $m( 'reg_email' ),
		'notes'        => $m( 'reg_notes' ),
		'submitted_at' => $date ? get_gmt_from_date( $date, 'c' ) : '',
	);
}

function rikaz_adm_sign( $secret, $ts, $nonce, $body ) {
	return hash_hmac( 'sha256', $ts . '.' . $nonce . '.' . $body, $secret );
}

/** Sends one queued post. Success is recorded only when Rikaz answers ok with a reference. */
function rikaz_adm_send( $post_id ) {
	$s = rikaz_adm_settings();
	$status = get_post_meta( $post_id, '_rikaz_status', true );
	if ( $status === 'success' || $status === '' ) { return; }
	if ( ! $s['endpoint'] || ! $s['source'] || ! $s['secret'] ) { rikaz_adm_fail( $post_id, 'الإعدادات غير مكتملة', false ); return; }
	$lock = 'rikaz_adm_lock_' . $post_id;
	if ( get_transient( $lock ) ) { return; }
	set_transient( $lock, 1, 60 );
	$p = rikaz_adm_payload( $post_id );
	if ( $p['student_name'] === '' || $p['phone'] === '' ) { delete_transient( $lock ); rikaz_adm_fail( $post_id, 'حقول الطلب لم تكتمل بعد', true ); return; }
	$body  = wp_json_encode( $p, JSON_UNESCAPED_UNICODE );
	$ts    = (string) time();
	$nonce = wp_generate_uuid4();
	$res = wp_remote_post( $s['endpoint'], array(
		'timeout' => 8,
		'headers' => array(
			'Content-Type'      => 'application/json; charset=utf-8',
			'X-Rikaz-Source'    => $s['source'],
			'X-Rikaz-Timestamp' => $ts,
			'X-Rikaz-Nonce'     => $nonce,
			'X-Rikaz-Signature' => rikaz_adm_sign( $s['secret'], $ts, $nonce, $body ),
		),
		'body'    => $body,
	) );
	delete_transient( $lock );
	if ( is_wp_error( $res ) ) { rikaz_adm_fail( $post_id, 'تعذر الاتصال بركاز', true ); return; }
	$code = (int) wp_remote_retrieve_response_code( $res );
	$j = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( $code === 200 && is_array( $j ) && ! empty( $j['ok'] ) && ! empty( $j['ref'] ) ) {
		update_post_meta( $post_id, '_rikaz_status', 'success' );
		update_post_meta( $post_id, '_rikaz_ref', sanitize_text_field( $j['ref'] ) );
		update_post_meta( $post_id, '_rikaz_error', '' );
		update_post_meta( $post_id, '_rikaz_synced_at', time() );
		return;
	}
	$c = is_array( $j ) && isset( $j['code'] ) ? sanitize_key( $j['code'] ) : 'http_' . $code;
	$msg = array( 'bad_signature' => 'توقيع غير صحيح — راجع المفتاح السري', 'unknown_source' => 'معرّف الربط غير صحيح أو موقوف', 'stale' => 'وقت الخادم غير مضبوط',
		'section_paused' => 'قسم القبول معلّق في ركاز', 'rate_limited' => 'طلبات كثيرة — ستُعاد لاحقًا', 'invalid' => 'بيانات الطلب غير مقبولة', 'unavailable' => 'ركاز غير متاح مؤقتًا' );
	// Wrong key/source/data will not fix itself, but stays retryable from the settings page.
	$retry = ! in_array( $c, array( 'bad_signature', 'unknown_source', 'invalid' ), true );
	rikaz_adm_fail( $post_id, isset( $msg[ $c ] ) ? $msg[ $c ] : 'رد غير متوقع (' . $code . ')', $retry );
}

function rikaz_adm_fail( $post_id, $why, $retry ) {
	$n = (int) get_post_meta( $post_id, '_rikaz_attempts', true ) + 1;
	update_post_meta( $post_id, '_rikaz_attempts', $n );
	update_post_meta( $post_id, '_rikaz_error', $why );
	update_post_meta( $post_id, '_rikaz_last_try', time() );
	if ( ! $retry || $n >= RIKAZ_ADM_MAX ) { update_post_meta( $post_id, '_rikaz_status', 'failed' ); return; }
	$delays = array( 60, 300, 900, 1800, 3600, 7200, 14400, 28800, 43200, 86400, 86400 );
	update_post_meta( $post_id, '_rikaz_status', 'pending' );
	update_post_meta( $post_id, '_rikaz_next', time() + $delays[ min( $n - 1, count( $delays ) - 1 ) ] );
}

add_action( RIKAZ_ADM_CRON, function () {
	$q = get_posts( array( 'post_type' => RIKAZ_ADM_PT, 'post_status' => 'any', 'posts_per_page' => 20, 'fields' => 'ids', 'orderby' => 'date', 'order' => 'ASC',
		'meta_query' => array( 'relation' => 'AND', array( 'key' => '_rikaz_status', 'value' => 'pending' ), array( 'key' => '_rikaz_next', 'value' => time(), 'compare' => '<=', 'type' => 'NUMERIC' ) ) ) );
	foreach ( $q as $id ) { rikaz_adm_send( $id ); }
} );

/* ---------- admin page ---------- */
add_action( 'admin_menu', function () {
	add_options_page( 'ربط ركاز', 'ربط ركاز (القبول)', 'manage_options', 'rikaz-admissions', 'rikaz_adm_page' );
} );

add_action( 'admin_post_rikaz_adm_save', function () {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'غير مصرح' ); }
	check_admin_referer( 'rikaz_adm_save' );
	$s = rikaz_adm_settings();
	$s['endpoint'] = esc_url_raw( wp_unslash( $_POST['endpoint'] ?? '' ), array( 'https' ) );
	$src = sanitize_text_field( wp_unslash( $_POST['source'] ?? '' ) );
	if ( preg_match( '/^[0-9a-f-]{36}$/i', $src ) ) { $s['source'] = $src; }
	$sec = trim( (string) wp_unslash( $_POST['secret'] ?? '' ) );
	$s['year'] = sanitize_text_field( wp_unslash( $_POST['year'] ?? '' ) );
	if ( $sec !== '' && preg_match( '/^[0-9a-f]{64}$/', $sec ) ) { $s['secret'] = $sec; } // empty field keeps the saved key
	update_option( RIKAZ_ADM_OPT, $s, false );
	wp_safe_redirect( admin_url( 'options-general.php?page=rikaz-admissions&saved=1' ) ); exit;
} );

add_action( 'admin_post_rikaz_adm_retry', function () {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'غير مصرح' ); }
	check_admin_referer( 'rikaz_adm_retry' );
	$ids = array_map( 'absint', (array) ( $_POST['ids'] ?? array() ) );
	foreach ( $ids as $id ) {
		if ( get_post_type( $id ) !== RIKAZ_ADM_PT ) { continue; }
		update_post_meta( $id, '_rikaz_attempts', 0 );
		rikaz_adm_enqueue( $id );
		rikaz_adm_send( $id );
	}
	wp_safe_redirect( admin_url( 'options-general.php?page=rikaz-admissions&retried=' . count( $ids ) . ( ! empty( $_POST['history'] ) ? '&tab=history' : '' ) ) ); exit;
} );

function rikaz_adm_page() {
	if ( ! current_user_can( 'manage_options' ) ) { return; }
	$s = rikaz_adm_settings();
	$tab = isset( $_GET['tab'] ) && $_GET['tab'] === 'history' ? 'history' : 'main';
	$labels = array( 'pending' => 'معلّق', 'success' => 'نجح', 'failed' => 'فشل' );
	echo '<div class="wrap" dir="rtl"><h1>ربط طلبات التسجيل مع ركاز</h1>';
	if ( isset( $_GET['saved'] ) ) { echo '<div class="notice notice-success"><p>حُفظت الإعدادات.</p></div>'; }
	if ( isset( $_GET['retried'] ) ) { echo '<div class="notice notice-info"><p>أُعيدت محاولة ' . (int) $_GET['retried'] . ' طلب.</p></div>'; }
	echo '<h2 class="nav-tab-wrapper"><a class="nav-tab ' . ( $tab === 'main' ? 'nav-tab-active' : '' ) . '" href="' . esc_url( admin_url( 'options-general.php?page=rikaz-admissions' ) ) . '">الإعدادات والحالة</a>';
	echo '<a class="nav-tab ' . ( $tab === 'history' ? 'nav-tab-active' : '' ) . '" href="' . esc_url( admin_url( 'options-general.php?page=rikaz-admissions&tab=history' ) ) . '">الطلبات السابقة</a></h2>';

	if ( $tab === 'main' ) {
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="rikaz_adm_save">';
		wp_nonce_field( 'rikaz_adm_save' );
		echo '<table class="form-table"><tr><th>عنوان الاستقبال في ركاز</th><td><input class="regular-text ltr" dir="ltr" name="endpoint" value="' . esc_attr( $s['endpoint'] ) . '" placeholder="https://…/api/public/admissions/wordpress"></td></tr>';
		echo '<tr><th>معرّف الربط</th><td><input class="regular-text ltr" dir="ltr" name="source" value="' . esc_attr( $s['source'] ) . '"></td></tr>';
		echo '<tr><th>المفتاح السري</th><td><input type="password" autocomplete="new-password" class="regular-text ltr" dir="ltr" name="secret" value="" placeholder="' . ( $s['secret'] ? esc_attr( '•••• ' . substr( $s['secret'], -4 ) . ' (محفوظ — اتركه فارغًا للإبقاء)' ) : 'الصقه من ركاز' ) . '"></td></tr>';
		echo '<tr><th>عام التقديم</th><td><input class="regular-text" name="year" value="' . esc_attr( $s['year'] ) . '" placeholder="مثال 1448"><p class="description">يُستخدم في القالب المعدّل لمنع التكرار داخل العام نفسه فقط.</p></td></tr></table>';
		submit_button( 'حفظ' );
		echo '</form><h2>آخر الطلبات المرسلة</h2>';
		$q = get_posts( array( 'post_type' => RIKAZ_ADM_PT, 'post_status' => 'any', 'posts_per_page' => 50, 'meta_key' => '_rikaz_status' ) );
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="rikaz_adm_retry">';
		wp_nonce_field( 'rikaz_adm_retry' );
		echo '<table class="widefat striped"><thead><tr><th></th><th>الطلب</th><th>الحالة</th><th>المحاولات</th><th>السبب</th><th>رقم ركاز</th></tr></thead><tbody>';
		foreach ( $q as $p ) {
			$st = get_post_meta( $p->ID, '_rikaz_status', true );
			echo '<tr><td>' . ( $st !== 'success' ? '<input type="checkbox" name="ids[]" value="' . (int) $p->ID . '">' : '' ) . '</td><td>#' . (int) $p->ID . ' ' . esc_html( get_post_meta( $p->ID, 'reg_student_name', true ) ) . '</td><td>' . esc_html( $labels[ $st ] ?? $st ) . '</td><td>' . (int) get_post_meta( $p->ID, '_rikaz_attempts', true ) . '</td><td>' . esc_html( get_post_meta( $p->ID, '_rikaz_error', true ) ) . '</td><td dir="ltr">' . esc_html( get_post_meta( $p->ID, '_rikaz_ref', true ) ) . '</td></tr>';
		}
		echo '</tbody></table>';
		submit_button( 'إعادة محاولة المحدد', 'secondary' );
		echo '</form>';
	} else {
		echo '<p>الطلبات المحفوظة قبل تفعيل الإضافة لا تُرسل تلقائيًا. حدد ما تريد إرساله ثم أكّد.</p>';
		$q = get_posts( array( 'post_type' => RIKAZ_ADM_PT, 'post_status' => 'publish', 'posts_per_page' => 200, 'date_query' => array( array( 'before' => gmdate( 'Y-m-d H:i:s', (int) $s['activated_at'] ), 'column' => 'post_date_gmt' ) ),
			'meta_query' => array( array( 'key' => '_rikaz_status', 'compare' => 'NOT EXISTS' ) ) ) );
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" onsubmit="return confirm(\'إرسال الطلبات المحددة إلى ركاز؟\');"><input type="hidden" name="action" value="rikaz_adm_retry"><input type="hidden" name="history" value="1">';
		wp_nonce_field( 'rikaz_adm_retry' );
		echo '<table class="widefat striped"><thead><tr><th></th><th>الطلب</th><th>الطالب</th><th>المدرسة</th><th>التاريخ</th></tr></thead><tbody>';
		foreach ( $q as $p ) {
			echo '<tr><td><input type="checkbox" name="ids[]" value="' . (int) $p->ID . '"></td><td>#' . (int) $p->ID . '</td><td>' . esc_html( get_post_meta( $p->ID, 'reg_student_name', true ) ) . '</td><td>' . esc_html( get_post_meta( $p->ID, 'reg_school', true ) ) . '</td><td>' . esc_html( get_post_meta( $p->ID, 'reg_date', true ) ) . '</td></tr>';
		}
		echo '</tbody></table>';
		submit_button( 'إرسال المحدد إلى ركاز', 'secondary' );
		echo '</form>';
	}
	echo '</div>';
}
