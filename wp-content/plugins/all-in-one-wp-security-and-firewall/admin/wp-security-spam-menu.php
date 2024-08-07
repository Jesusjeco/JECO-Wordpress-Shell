<?php
if (!defined('ABSPATH')) {
	exit; // Exit if accessed directly
}

class AIOWPSecurity_Spam_Menu extends AIOWPSecurity_Admin_Menu {
	
	/**
	 * Spam menu slug
	 *
	 * @var string
	 */
	protected $menu_page_slug = AIOWPSEC_SPAM_MENU_SLUG;
	
	/**
	 * Constructor adds menu for Spam prevention
	 */
	public function __construct() {
		parent::__construct(__('Spam prevention', 'all-in-one-wp-security-and-firewall'));
	}
	
	/**
	 * This function will setup the menus tabs by setting the array $menu_tabs
	 *
	 * @return void
	 */
	protected function setup_menu_tabs() {
		$menu_tabs = array(
			'comment-spam' => array(
				'title' => __('Comment spam', 'all-in-one-wp-security-and-firewall'),
				'render_callback' => array($this, 'render_comment_spam'),
			),
			'comment-spam-ip-monitoring' => array(
				'title' => __('Comment spam IP monitoring', 'all-in-one-wp-security-and-firewall'),
				'render_callback' => array($this, 'render_comment_spam_ip_monitoring'),
			),
		);

		$this->menu_tabs = array_filter($menu_tabs, array($this, 'should_display_tab'));
	}
	
	/**
	 * Renders the submenu's comment spam ip monitoring tab body.
	 *
	 * @return Void
	 */
	protected function render_comment_spam() {
		global $aiowps_feature_mgr, $aio_wp_security;

		if (isset($_POST['aiowps_apply_comment_spam_prevention_settings'])) { // Do form submission tasks
			$nonce = $_REQUEST['_wpnonce'];
			if (!wp_verify_nonce($nonce, 'aiowpsec-comment-spam-settings-nonce')) {
				$aio_wp_security->debug_logger->log_debug("Nonce check failed on save comment spam settings.", 4);
				die("Nonce check failed on save comment spam settings.");
			}

			// Save settings
			$random_20_digit_string = AIOWPSecurity_Utility::generate_alpha_numeric_random_string(20); // Generate random 20 char string for use during CAPTCHA encode/decode
			$aio_wp_security->configs->set_value('aiowps_captcha_secret_key', $random_20_digit_string);

			$aio_wp_security->configs->set_value('aiowps_enable_spambot_detecting', isset($_POST["aiowps_enable_spambot_detecting"]) ? '1' : '');
			$aio_wp_security->configs->set_value('aiowps_spam_comments_should', !empty($_POST["aiowps_spam_comments_should"]) ? '1' : '0');

			$aio_wp_security->configs->set_value('aiowps_enable_trash_spam_comments', isset($_POST['aiowps_enable_trash_spam_comments']) ? '1' : '');
			$aiowps_trash_spam_comments_after_days = '';
			if (isset($_POST['aiowps_trash_spam_comments_after_days'])) {
				if (!empty($_POST['aiowps_trash_spam_comments_after_days'])) {
					$aiowps_trash_spam_comments_after_days = sanitize_text_field($_POST['aiowps_trash_spam_comments_after_days']);
				}
				if (isset($_POST['aiowps_enable_trash_spam_comments']) && !is_numeric($aiowps_trash_spam_comments_after_days)) {
					$error = __('You entered a non numeric value for the "move spam comments to trash after number of days" field.', 'all-in-one-wp-security-and-firewall').' '.__('It has been set to the default value.', 'all-in-one-wp-security-and-firewall');
					$aiowps_trash_spam_comments_after_days = '14';//Set it to the default value for this field
					$this->show_msg_error(__('Attention:', 'all-in-one-wp-security-and-firewall').' '.htmlspecialchars($error));
				}
				$aiowps_trash_spam_comments_after_days = absint($aiowps_trash_spam_comments_after_days);
				$aio_wp_security->configs->set_value('aiowps_trash_spam_comments_after_days', $aiowps_trash_spam_comments_after_days);
			}

			//Commit the config settings
			$aio_wp_security->configs->save_config();
			
			AIOWPSecurity_Comment::trash_spam_comments();

			//Recalculate points after the feature status/options have been altered
			$aiowps_feature_mgr->check_feature_status_and_recalculate_points();

			//Now let's write the applicable rules to the .htaccess file
			$res = AIOWPSecurity_Utility_Htaccess::write_to_htaccess();

			if ($res) {
				$this->show_msg_updated(__('Settings were successfully saved', 'all-in-one-wp-security-and-firewall'));
			} else {
				$this->show_msg_error(__('Could not write to the .htaccess file, please check the file permissions.', 'all-in-one-wp-security-and-firewall'));
			}
		}
		$aio_wp_security->include_template('wp-admin/spam-prevention/comment-spam.php', false, array('aiowps_feature_mgr' => $aiowps_feature_mgr));
	}

	/**
	 * Renders the submenu's comment spam ip monitoring tab body.
	 *
	 * @return Void
	 */
	protected function render_comment_spam_ip_monitoring() {
		global $aio_wp_security, $aiowps_feature_mgr, $wpdb;
		include_once 'wp-security-list-comment-spammer-ip.php'; // For rendering the AIOWPSecurity_List_Table in tab2
		$spammer_ip_list = new AIOWPSecurity_List_Comment_Spammer_IP();

		// Do form submission tasks for auto block spam IP
		if (isset($_POST['aiowps_auto_spam_block'])) {
			$error = '';
			$nonce = $_REQUEST['_wpnonce'];
			if (!wp_verify_nonce($nonce, 'aiowpsec-auto-block-spam-ip-nonce')) {
				$aio_wp_security->debug_logger->log_debug('Nonce check failed on auto block spam IPs options save.', 4);
				die('Nonce check failed on auto block spam IPs options save.');
			}

			$spam_ip_min_comments = sanitize_text_field($_POST['aiowps_spam_ip_min_comments_block']);
			if (!is_numeric($spam_ip_min_comments)) {
				$error .= '<br />'.__('You entered a non numeric value for the minimum number of spam comments field, it has been set to the default value.', 'all-in-one-wp-security-and-firewall');
				$spam_ip_min_comments = '3';// Set it to the default value for this field
			} elseif (empty($spam_ip_min_comments)) {
				$error .= '<br />'.__('You must enter an integer greater than zero for the minimum number of spam comments field, it has been set to the default value.', 'all-in-one-wp-security-and-firewall');
				$spam_ip_min_comments = '3';// Set it to the default value for this field
			}

			if ($error) {
				$this->show_msg_error(__('Attention:', 'all-in-one-wp-security-and-firewall').' '.$error);
			}

			// Save all the form values to the options
			$aio_wp_security->configs->set_value('aiowps_enable_autoblock_spam_ip', isset($_POST["aiowps_enable_autoblock_spam_ip"]) ? '1' : '');
			$aio_wp_security->configs->set_value('aiowps_spam_ip_min_comments_block', absint($spam_ip_min_comments));
			$aio_wp_security->configs->save_config();

			//Recalculate points after the feature status/options have been altered
			$aiowps_feature_mgr->check_feature_status_and_recalculate_points();

			$this->show_msg_settings_updated();
		}

		if (isset($_POST['aiowps_ip_spam_comment_search'])) {
			$error = '';
			$nonce = $_REQUEST['_wpnonce'];
			if (!wp_verify_nonce($nonce, 'aiowpsec-spammer-ip-list-nonce')) {
				$aio_wp_security->debug_logger->log_debug('Nonce check failed for list spam comment IPs.', 4);
				die(__('Nonce check failed for list spam comment IPs.', 'all-in-one-wp-security-and-firewall'));
			}

			$min_comments_per_ip = sanitize_text_field($_POST['aiowps_spam_ip_min_comments']);
			if (!is_numeric($min_comments_per_ip)) {
				$error .= '<br>'.__('You entered a non numeric value for the minimum spam comments per IP field.', 'all-in-one-wp-security-and-firewall').' '.__('It has been set to the default value.', 'all-in-one-wp-security-and-firewall');
				$min_comments_per_ip = '5'; // Set it to the default value for this field
			}

			if ($error) {
				$this->show_msg_error(__('Attention:', 'all-in-one-wp-security-and-firewall').' '.$error);
			}

			// Save all the form values to the options
			$aio_wp_security->configs->set_value('aiowps_spam_ip_min_comments', absint($min_comments_per_ip), true);

			$info_msg_string = sprintf(__('Displaying results for IP addresses which have posted a minimum of %s spam comments.', 'all-in-one-wp-security-and-firewall'), $min_comments_per_ip);
			$this->show_msg_updated($info_msg_string);
		}

		if (isset($_GET['action'])) { // Do list table form row action tasks
			$nonce = isset($_GET['aiowps_nonce']) ? $_GET['aiowps_nonce'] : '';
			$nonce_user_cap_result = AIOWPSecurity_Utility_Permissions::check_nonce_and_user_cap($nonce, 'block_spammer_ip');
			
			if (is_wp_error($nonce_user_cap_result)) {
				$aio_wp_security->debug_logger->log_debug($nonce_user_cap_result->get_error_message(), 4);
				die($nonce_user_cap_result->get_error_message());
			}
			if ('block_spammer_ip' == $_GET['action']) { //The "block" link was clicked for a row in the list table
				$spammer_ip_list->block_spammer_ip_records(strip_tags($_GET['spammer_ip']));
			}
		}

		$block_comments_output = '';

		$min_block_comments = $aio_wp_security->configs->get_value('aiowps_spam_ip_min_comments_block');
		if (!empty($min_block_comments)) {
			$sql = $wpdb->prepare('SELECT * FROM '.AIOWPSEC_TBL_PERM_BLOCK.' WHERE block_reason=%s', 'spam');
			$total_res = $wpdb->get_results($sql);
			$block_comments_output = '<div class="aio_yellow_box">';
			if (empty($total_res)) {
				$block_comments_output .= '<p><strong>'.__('You currently have no IP addresses permanently blocked due to spam.', 'all-in-one-wp-security-and-firewall').'</strong></p></div>';
			} else {
				$total_count = count($total_res);
				$todays_blocked_count = 0;
				foreach ($total_res as $blocked_item) {
					$now_date_time = new DateTime('now', new DateTimeZone('UTC'));
					$blocked_date = new DateTime('@'.$blocked_item->created); //@ with timestamp creates correct DateTime
					if ($blocked_date->format('Y-m-d') == $now_date_time->format('Y-m-d')) {
						//there was an IP added to permanent block list today
						++$todays_blocked_count;
					}
				}
				$block_comments_output .= '<p><strong>'.__('Spammer IPs added to permanent block list today:', 'all-in-one-wp-security-and-firewall'). ' ' . $todays_blocked_count.'</strong></p>'.'<hr><p><strong>'.__('All time total:', 'all-in-one-wp-security-and-firewall'). ' ' .$total_count.'</strong></p>'.'<p><a class="button" href="admin.php?page='.AIOWPSEC_MAIN_MENU_SLUG.'&tab=permanent-block" target="_blank">'.__('View blocked IPs', 'all-in-one-wp-security-and-firewall').'</a></p></div>';
			}
		}

		$page = $_REQUEST['page'];
		$tab = $_REQUEST['tab'];

		$aio_wp_security->include_template('wp-admin/spam-prevention/comment-spam-ip-monitoring.php', false, array('spammer_ip_list' => $spammer_ip_list, 'aiowps_feature_mgr' => $aiowps_feature_mgr, 'block_comments_output' => $block_comments_output, 'page' => $page, 'tab' => $tab));
	}
}
