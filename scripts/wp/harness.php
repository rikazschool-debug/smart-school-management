<?php
// Minimal WordPress stand-in to run the real Rikaz plugin code from the CLI (scripts/wp-e2e.ts drives it).
// Usage: php harness.php '<json config>' → prints JSON {meta, hooked}
define('ABSPATH', '/tmp/');
$cfg = json_decode($argv[1], true);
$GLOBALS['opt'] = array('rikaz_adm_settings' => $cfg['settings']);
$GLOBALS['meta'] = $cfg['meta'] ?? array();
$GLOBALS['actions'] = array();
function add_action($h, $f, $p = 10, $n = 1) { $GLOBALS['actions'][$h][] = $f; }
function add_filter($h, $f) {}
function register_activation_hook($f, $cb) {} function register_deactivation_hook($f, $cb) {}
function get_option($k, $d = false) { return $GLOBALS['opt'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['opt'][$k] = $v; }
function wp_parse_args($a, $d) { return array_merge($d, $a); }
function get_post_meta($id, $k, $s = true) { return $GLOBALS['meta'][$id][$k] ?? ''; }
function update_post_meta($id, $k, $v) { $GLOBALS['meta'][$id][$k] = $v; }
function get_transient($k) { return false; } function set_transient($k, $v, $t) {} function delete_transient($k) {}
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
function wp_generate_uuid4() { return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000, mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff)); }
function get_gmt_from_date($d, $f) { return gmdate('c', strtotime($d . ' +0300') ?: time()); }
function sanitize_text_field($s) { return trim((string)$s); } function sanitize_key($s) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower($s)); }
class WP_Error {} function is_wp_error($x) { return $x instanceof WP_Error; }
function wp_remote_post($url, $a) {
  $h = array(); foreach ($a['headers'] as $k => $v) $h[] = "$k: $v";
  $c = curl_init($url); curl_setopt_array($c, array(CURLOPT_POST => 1, CURLOPT_POSTFIELDS => $a['body'], CURLOPT_HTTPHEADER => $h, CURLOPT_RETURNTRANSFER => 1, CURLOPT_TIMEOUT => $a['timeout']));
  $b = curl_exec($c); if ($b === false) return new WP_Error(); $code = curl_getinfo($c, CURLINFO_HTTP_CODE);
  return array('code' => $code, 'body' => $b);
}
function wp_remote_retrieve_response_code($r) { return $r['code']; } function wp_remote_retrieve_body($r) { return $r['body']; }
require __DIR__ . '/../../integrations/wordpress/rikaz-admissions/rikaz-admissions.php';
$hooked = null;
if (!empty($cfg['insert'])) { // simulate wp_after_insert_post for a new post
  $p = (object) $cfg['insert'];
  foreach ($GLOBALS['actions']['wp_after_insert_post'] as $f) $f($p->ID, $p, false);
  $hooked = $GLOBALS['meta'][$p->ID]['_rikaz_status'] ?? '';
  foreach ($GLOBALS['actions']['shutdown'] ?? array() as $f) $f();
}
foreach ($cfg['send'] ?? array() as $id) rikaz_adm_send($id);
echo json_encode(array('meta' => $GLOBALS['meta'], 'hooked' => $hooked), JSON_UNESCAPED_UNICODE);
